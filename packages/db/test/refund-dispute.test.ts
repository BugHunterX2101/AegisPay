import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findOrderIdByCaptureId, getDispute, getEvidenceBundle, insertEvidenceBundle, insertOrder, insertRefund,
  latestEvidenceBundle, listRefunds, markBundleReviewed, markBundleSubmitted, refundedMinor, upsertDispute,
  uuidv7, withTx,
} from '../src/index.ts';
import type { DisputeUpsert } from '../src/index.ts';
import { freshDb, seedProposal } from './helpers.ts';
import type { TestDb } from './helpers.ts';

let t: TestDb;
beforeAll(async () => {
  t = await freshDb();
});
afterAll(async () => {
  await t.drop();
});

async function settledOrder(amountMinor = 100000n, captureId: string | null = `CAP-${uuidv7()}`) {
  const proposalId = await seedProposal(t.db);
  const id = uuidv7();
  await withTx((tx) => insertOrder(tx, { id, proposalId, state: 'SETTLED', amountMinor }), t.db);
  if (captureId) await t.db.query('update purchase_order set capture_id = $2 where id = $1', [id, captureId]);
  return { id, captureId };
}

const refund = (orderId: string, over: Partial<Parameters<typeof insertRefund>[1]> = {}) => ({
  refundId: `RF-${uuidv7()}`, orderId, amountMinor: 25000n, status: 'COMPLETED' as const, reason: 'short shipment', confirmedBy: 'owner@acme.test', ...over,
});

describe('refund storage', () => {
  it('sums only COMPLETED and PENDING refunds, as bigint', async () => {
    const o = await settledOrder();
    await withTx(async (tx) => {
      await insertRefund(tx, refund(o.id, { amountMinor: 10000n, status: 'COMPLETED' }));
      await insertRefund(tx, refund(o.id, { amountMinor: 5000n, status: 'PENDING' }));
      await insertRefund(tx, refund(o.id, { amountMinor: 7000n, status: 'FAILED' }));
      await insertRefund(tx, refund(o.id, { amountMinor: 3000n, status: 'CANCELLED' }));
    }, t.db);
    expect(await refundedMinor(t.db, o.id)).toBe(15000n);
    expect(await listRefunds(t.db, o.id)).toHaveLength(4);
  });

  it('is zero for an order with no refunds, and per order', async () => {
    const a = await settledOrder();
    const b = await settledOrder();
    await withTx((tx) => insertRefund(tx, refund(a.id)), t.db);
    expect(await refundedMinor(t.db, b.id)).toBe(0n);
    expect(await refundedMinor(t.db, a.id)).toBe(25000n);
  });

  it('replaying the same PayPal refund id updates its status instead of inserting twice', async () => {
    const o = await settledOrder();
    const r = refund(o.id, { status: 'PENDING' });
    await withTx((tx) => insertRefund(tx, r), t.db);
    await withTx((tx) => insertRefund(tx, { ...r, status: 'COMPLETED' }), t.db);
    const rows = await listRefunds(t.db, o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('COMPLETED');
    expect(await refundedMinor(t.db, o.id)).toBe(25000n);
  });

  it('a refund that moves PENDING to FAILED stops counting', async () => {
    const o = await settledOrder();
    const r = refund(o.id, { status: 'PENDING' });
    await withTx((tx) => insertRefund(tx, r), t.db);
    expect(await refundedMinor(t.db, o.id)).toBe(25000n);
    await withTx((tx) => insertRefund(tx, { ...r, status: 'FAILED' }), t.db);
    expect(await refundedMinor(t.db, o.id)).toBe(0n);
  });

  it('rejects a zero amount, an unknown status and an unknown order at the database', async () => {
    const o = await settledOrder();
    await expect(withTx((tx) => insertRefund(tx, refund(o.id, { amountMinor: 0n })), t.db)).rejects.toMatchObject({ code: '23514' });
    await expect(withTx((tx) => insertRefund(tx, refund(o.id, { status: 'BOGUS' as never })), t.db)).rejects.toMatchObject({ code: '23514' });
    await expect(withTx((tx) => insertRefund(tx, refund(uuidv7())), t.db)).rejects.toMatchObject({ code: '23503' });
  });
});

const dispute = (id: string, over: Partial<DisputeUpsert> = {}): DisputeUpsert => ({
  paypalDisputeId: id, orderId: null, reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', status: 'WAITING_FOR_SELLER_RESPONSE',
  lifeCycleStage: 'INQUIRY', sellerResponseDue: new Date('2026-11-20T00:00:00Z'),
  links: [{ href: `https://api-m.sandbox.paypal.com/v1/customer/disputes/${id}/provide-evidence`, rel: 'provide_evidence', method: 'POST' }],
  outcome: null, ...over,
});

describe('dispute storage', () => {
  it('finds the order by its capture id, and not by anything else', async () => {
    const o = await settledOrder();
    expect(await findOrderIdByCaptureId(t.db, o.captureId!)).toBe(o.id);
    expect(await findOrderIdByCaptureId(t.db, 'CAP-UNKNOWN')).toBeNull();
  });

  it('round-trips links and dates', async () => {
    const id = `PP-D-${uuidv7()}`;
    const saved = await withTx((tx) => upsertDispute(tx, dispute(id)), t.db);
    expect(saved.links[0]).toMatchObject({ rel: 'provide_evidence', method: 'POST' });
    expect(saved.sellerResponseDue?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(await getDispute(t.db, id)).toMatchObject({ paypalDisputeId: id, status: 'WAITING_FOR_SELLER_RESPONSE' });
    expect(await getDispute(t.db, 'PP-D-NOPE')).toBeNull();
  });

  it('a later sync refreshes status and links but never drops a known order link', async () => {
    const o = await settledOrder();
    const id = `PP-D-${uuidv7()}`;
    await withTx((tx) => upsertDispute(tx, dispute(id, { orderId: o.id })), t.db);
    const after = await withTx((tx) => upsertDispute(tx, dispute(id, { orderId: null, status: 'UNDER_REVIEW', links: [] })), t.db);
    expect(after.orderId).toBe(o.id);
    expect(after.status).toBe('UNDER_REVIEW');
    expect(after.links).toEqual([]);
  });
});

describe('evidence bundle storage', () => {
  const file = { name: 'fulfillment.pdf', mime: 'application/pdf', sha256: 'c'.repeat(64), bytes_base64: 'JVBERi0xLjQ=' };
  async function newBundle(disputeId: string) {
    await withTx((tx) => upsertDispute(tx, dispute(disputeId)), t.db);
    return withTx((tx) => insertEvidenceBundle(tx, {
      id: uuidv7(), disputeId, plan: { type: 'PROOF_OF_FULFILLMENT' }, inputJson: { evidences: [] }, files: [file], sha256: 'd'.repeat(64),
    }), t.db);
  }

  it('stores the bytes and hash, and returns the newest bundle for a dispute', async () => {
    const d = `PP-D-${uuidv7()}`;
    const first = await newBundle(d);
    const second = await withTx((tx) => insertEvidenceBundle(tx, {
      id: uuidv7(), disputeId: d, plan: {}, inputJson: {}, files: [file], sha256: 'e'.repeat(64),
    }), t.db);
    expect((await getEvidenceBundle(t.db, first.id))!.files[0]).toEqual(file);
    expect((await latestEvidenceBundle(t.db, d))!.id).toBe(second.id);
    expect(await latestEvidenceBundle(t.db, 'PP-D-NONE')).toBeNull();
  });

  it('rejects a malformed sha256 at the database', async () => {
    const d = `PP-D-${uuidv7()}`;
    await withTx((tx) => upsertDispute(tx, dispute(d)), t.db);
    await expect(withTx((tx) => insertEvidenceBundle(tx, {
      id: uuidv7(), disputeId: d, plan: {}, inputJson: {}, files: [], sha256: 'NOT-A-HASH',
    }), t.db)).rejects.toMatchObject({ code: '23514' });
  });

  it('is submitted at most once: a second submit does not overwrite the first PayPal response', async () => {
    const b = await newBundle(`PP-D-${uuidv7()}`);
    expect(await withTx((tx) => markBundleSubmitted(tx, b.id, { name: 'first' }), t.db)).toBe(true);
    expect(await withTx((tx) => markBundleSubmitted(tx, b.id, { name: 'second' }), t.db)).toBe(false);
    const after = (await getEvidenceBundle(t.db, b.id))!;
    expect(after.paypalResponse).toEqual({ name: 'first' });
    expect(after.submittedAt).toBeInstanceOf(Date);
  });

  it('can be reviewed only before submission', async () => {
    const b = await newBundle(`PP-D-${uuidv7()}`);
    expect(await withTx((tx) => markBundleReviewed(tx, b.id, 'owner@acme.test'), t.db)).toBe(true);
    expect((await getEvidenceBundle(t.db, b.id))!.reviewedBy).toBe('owner@acme.test');
    await withTx((tx) => markBundleSubmitted(tx, b.id, {}), t.db);
    expect(await withTx((tx) => markBundleReviewed(tx, b.id, 'someone-else'), t.db)).toBe(false);
    expect((await getEvidenceBundle(t.db, b.id))!.reviewedBy).toBe('owner@acme.test');
  });

  it('reviewing or submitting an unknown bundle changes nothing', async () => {
    expect(await withTx((tx) => markBundleReviewed(tx, uuidv7(), 'x'), t.db)).toBe(false);
    expect(await withTx((tx) => markBundleSubmitted(tx, uuidv7(), {}), t.db)).toBe(false);
  });
});
