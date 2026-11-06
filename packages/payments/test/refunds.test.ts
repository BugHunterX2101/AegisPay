import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getOrder, listRefunds, refundedMinor, transition, verifyChain, withTx } from '@aegis/db';
import { capture } from '../src/authorizations.ts';
import { authorizeHold, createHold } from '../src/orders.ts';
import { refundCapture } from '../src/refunds.ts';
import { paypalRequestId } from '../src/request-id.ts';
import { seedFulfillment, seedGatedOrder, startHarness } from './harness.ts';
import type { Harness } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.pp.seen.length = 0;
  h.pp.failures.length = 0;
  h.pp.captureStatus = 'COMPLETED';
  h.pp.refundStatus = 'COMPLETED';
  h.pp.delayMs = 0;
  h.sleeps.length = 0;
  h.writes.enabled = true;
  h.clock.offsetMs = 0;
});

const APP = 'https://aegispay.example';
const OWNER = 'owner@acme.test';
const refundPosts = () => h.pp.seen.filter((c) => c.method === 'POST' && c.path.endsWith('/refund'));
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as DomainError).code;
const auditTypes = async (orderId: string) =>
  (await h.t.db.query<{ type: string }>(`select type from audit_event where entity_id = $1 order by seq`, [orderId])).rows.map((r) => r.type);
const move = (id: string, from: Array<'HELD' | 'IN_TRANSIT' | 'SETTLED'>, to: 'IN_TRANSIT' | 'DELIVERED' | 'DISPUTED') =>
  withTx((tx) => transition(tx, id, from, to), h.t.db);

/** A real settled order: hold → approval → authorization → delivery record → capture. Total is 14040 minor. */
async function settled() {
  const s = await seedGatedOrder(h.t);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'USB-C cables' }, appUrl: APP });
  h.pp.approve(paypalOrderId);
  await authorizeHold(h.ctx, s.orderId, paypalOrderId, { approvedBy: OWNER });
  await move(s.orderId, ['HELD'], 'IN_TRANSIT');
  await move(s.orderId, ['IN_TRANSIT'], 'DELIVERED');
  await seedFulfillment(h.t, s.orderId);
  const cap = await capture(h.ctx, s.orderId);
  h.pp.seen.length = 0;
  return { ...s, captureId: cap.captureId };
}

const state = async (id: string) => (await getOrder(h.t.db, id))!.state;

describe('full refund', () => {
  it('refunds the whole capture, settles the books and moves the order to REFUNDED', async () => {
    const s = await settled();
    const r = await refundCapture(h.ctx, s.orderId, { reason: 'wrong item shipped', confirmedBy: OWNER });
    expect(r).toMatchObject({ status: 'COMPLETED', amountMinor: 14040n, refundedMinor: 14040n, fullyRefunded: true });

    const call = refundPosts()[0]!;
    expect(call.path).toBe(`/v2/payments/captures/${s.captureId}/refund`);
    expect(call.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'refund', 1));
    expect(call.body).toMatchObject({ amount: { currency_code: 'USD', value: '140.40' }, note_to_payer: 'wrong item shipped' });

    expect(await state(s.orderId)).toBe('REFUNDED');
    expect(await listRefunds(h.t.db, s.orderId)).toMatchObject([{ refundId: r.refundId, amountMinor: 14040n, status: 'COMPLETED', confirmedBy: OWNER }]);
    expect(h.pp.captures.get(s.captureId)!.refundedMinor).toBe(14040);
  });

  it('audits who confirmed it with PayPal ids, and the audit chain still verifies', async () => {
    const s = await settled();
    await refundCapture(h.ctx, s.orderId, { reason: 'defective', confirmedBy: OWNER });
    expect(await auditTypes(s.orderId)).toContain('REFUNDED');
    const ev = (await h.t.db.query<{ actor: string; payload: Record<string, unknown>; paypal_request_id: string | null }>(
      `select actor, payload, paypal_request_id from audit_event where entity_id = $1 and type = 'REFUNDED'`,
      [s.orderId],
    )).rows[0]!;
    expect(ev.actor).toBe(`user:${OWNER}`);
    expect(ev.paypal_request_id).toBe(paypalRequestId(s.orderId, 'refund', 1));
    expect(ev.payload).toMatchObject({ amountMinor: '14040', captureAmountMinor: '14040', fullyRefunded: true, previousState: 'SETTLED', reason: 'defective' });
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('a DISPUTED order can be refunded, which resolves it to REFUNDED', async () => {
    const s = await settled();
    await move(s.orderId, ['SETTLED'], 'DISPUTED');
    const r = await refundCapture(h.ctx, s.orderId, { reason: 'merchant concedes the dispute', confirmedBy: OWNER });
    expect(r.fullyRefunded).toBe(true);
    expect(await state(s.orderId)).toBe('REFUNDED');
  });
});

describe('partial and cumulative refunds', () => {
  it('a partial refund keeps the order SETTLED; the remainder then completes it, each under its own request id', async () => {
    const s = await settled();
    const first = await refundCapture(h.ctx, s.orderId, { amountMinor: 5000n, reason: 'short shipment: 4 of 10', confirmedBy: OWNER });
    expect(first).toMatchObject({ amountMinor: 5000n, refundedMinor: 5000n, fullyRefunded: false });
    expect(await state(s.orderId)).toBe('SETTLED');

    const second = await refundCapture(h.ctx, s.orderId, { reason: 'rest of the order', confirmedBy: OWNER });
    expect(second).toMatchObject({ amountMinor: 9040n, refundedMinor: 14040n, fullyRefunded: true });
    expect(await state(s.orderId)).toBe('REFUNDED');

    const ids = refundPosts().map((c) => c.headers['paypal-request-id']);
    expect(ids).toEqual([paypalRequestId(s.orderId, 'refund', 1), paypalRequestId(s.orderId, 'refund', 2)]);
    expect(await refundedMinor(h.t.db, s.orderId)).toBe(14040n);
  });

  it('refuses more than what is left, before calling PayPal', async () => {
    const s = await settled();
    await refundCapture(h.ctx, s.orderId, { amountMinor: 10000n, reason: 'partial', confirmedBy: OWNER });
    h.pp.seen.length = 0;
    const err = (await refundCapture(h.ctx, s.orderId, { amountMinor: 4041n, reason: 'too much', confirmedBy: OWNER }).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('AMOUNT_MISMATCH');
    expect(err.details).toMatchObject({ refundableMinor: '4040' });
    expect(refundPosts()).toHaveLength(0);
    expect(await refundedMinor(h.t.db, s.orderId)).toBe(10000n);
  });

  it('refuses a refund once the capture is fully refunded', async () => {
    const s = await settled();
    await refundCapture(h.ctx, s.orderId, { reason: 'all of it', confirmedBy: OWNER });
    h.pp.seen.length = 0;
    // REFUNDED is terminal, so the state guard answers first
    expect(await code(refundCapture(h.ctx, s.orderId, { amountMinor: 1n, reason: 'again', confirmedBy: OWNER }))).toBe('BAD_STATE');
    expect(refundPosts()).toHaveLength(0);
  });
});

describe('who and what may be refunded', () => {
  it('needs a named human, a reason and a positive amount, and sends nothing otherwise', async () => {
    const s = await settled();
    expect(await code(refundCapture(h.ctx, s.orderId, { reason: 'x', confirmedBy: '  ' }))).toBe('FORBIDDEN');
    expect(await code(refundCapture(h.ctx, s.orderId, { reason: ' ', confirmedBy: OWNER }))).toBe('VALIDATION');
    expect(await code(refundCapture(h.ctx, s.orderId, { amountMinor: 0n, reason: 'x', confirmedBy: OWNER }))).toBe('VALIDATION');
    expect(await code(refundCapture(h.ctx, s.orderId, { amountMinor: -5n, reason: 'x', confirmedBy: OWNER }))).toBe('VALIDATION');
    expect(refundPosts()).toHaveLength(0);
    expect(await state(s.orderId)).toBe('SETTLED');
  });

  it('refuses an order that has not been captured', async () => {
    const seeded = await seedGatedOrder(h.t);
    expect(await code(refundCapture(h.ctx, seeded.orderId, { reason: 'x', confirmedBy: OWNER }))).toBe('BAD_STATE');
    expect(await code(refundCapture(h.ctx, '00000000-0000-7000-8000-000000000000', { reason: 'x', confirmedBy: OWNER }))).toBe('NOT_FOUND');
    expect(refundPosts()).toHaveLength(0);
  });

  it('is blocked by the kill switch before any network call, leaving no trace in the books', async () => {
    const s = await settled();
    h.writes.enabled = false;
    expect(await code(refundCapture(h.ctx, s.orderId, { reason: 'x', confirmedBy: OWNER }))).toBe('WRITES_DISABLED');
    expect(h.pp.seen).toHaveLength(0);
    expect(await listRefunds(h.t.db, s.orderId)).toHaveLength(0);
    expect(await state(s.orderId)).toBe('SETTLED');
  });
});

describe('idempotency and PayPal as the backstop', () => {
  it('a retry after a lost response re-sends the same request id and does not refund twice', async () => {
    const s = await settled();
    const first = await refundCapture(h.ctx, s.orderId, { amountMinor: 5000n, reason: 'short shipment', confirmedBy: OWNER });
    // the response was lost: nothing was recorded locally
    await h.t.db.query('delete from refund where order_id = $1', [s.orderId]);
    const retry = await refundCapture(h.ctx, s.orderId, { amountMinor: 5000n, reason: 'short shipment', confirmedBy: OWNER });

    const ids = refundPosts().map((c) => c.headers['paypal-request-id']);
    expect(ids).toEqual([paypalRequestId(s.orderId, 'refund', 1), paypalRequestId(s.orderId, 'refund', 1)]);
    expect(retry.refundId).toBe(first.refundId);
    expect(h.pp.captures.get(s.captureId)!.refundedMinor).toBe(5000); // PayPal moved the money once
    expect(await listRefunds(h.t.db, s.orderId)).toHaveLength(1);
  });

  it("maps PayPal's own over-refund rejection to AMOUNT_MISMATCH and records nothing", async () => {
    const s = await settled();
    h.pp.captures.get(s.captureId)!.refundedMinor = 12000; // refunded elsewhere (PayPal dashboard): we do not know yet
    const err = (await refundCapture(h.ctx, s.orderId, { amountMinor: 5000n, reason: 'x', confirmedBy: OWNER }).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('AMOUNT_MISMATCH');
    expect(err.paypalName).toBe('REFUND_AMOUNT_EXCEEDED');
    expect(await listRefunds(h.t.db, s.orderId)).toHaveLength(0);
    expect(await state(s.orderId)).toBe('SETTLED');
  });

  it('two concurrent refunds can never move more money than the capture', async () => {
    const s = await settled();
    const results = await Promise.allSettled([
      refundCapture(h.ctx, s.orderId, { amountMinor: 10000n, reason: 'a', confirmedBy: OWNER }),
      refundCapture(h.ctx, s.orderId, { amountMinor: 10000n, reason: 'b', confirmedBy: OWNER }),
    ]);
    // Both callers may compute the same idempotency attempt and get the SAME refund replayed; what must never
    // happen is two distinct refunds. Which interleaving occurs depends on timing, and both are safe.
    const ids = new Set(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.refundId] : [])));
    expect(ids.size).toBeLessThanOrEqual(1);
    expect((await listRefunds(h.t.db, s.orderId)).length).toBeLessThanOrEqual(1);
    expect(h.pp.captures.get(s.captureId)!.refundedMinor).toBeLessThanOrEqual(14040);
    expect(await refundedMinor(h.t.db, s.orderId)).toBeLessThanOrEqual(14040n);
  });
});

describe('PENDING refunds', () => {
  it('count against the capture but do not close the order until they are known to be final', async () => {
    const s = await settled();
    h.pp.refundStatus = 'PENDING';
    const r = await refundCapture(h.ctx, s.orderId, { reason: 'full refund', confirmedBy: OWNER });
    expect(r).toMatchObject({ status: 'PENDING', refundedMinor: 14040n, fullyRefunded: false });
    expect(await state(s.orderId)).toBe('SETTLED');
    expect(await refundedMinor(h.t.db, s.orderId)).toBe(14040n);
    // nothing left to refund, so a second request is refused rather than sent
    h.pp.seen.length = 0;
    expect(await code(refundCapture(h.ctx, s.orderId, { reason: 'again', confirmedBy: OWNER }))).toBe('AMOUNT_MISMATCH');
    expect(refundPosts()).toHaveLength(0);
  });
});
