import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@aegis/core';
import type { OrderState } from '@aegis/core';
import {
  BUDGET_COMMITTED_STATES, amendMandate, createMandate, getCurrentMandate, getMandate, insertOrder, insertProposal,
  listMandates, mandateSha256, setMandateStatus, spentSoFar, toGateMandate, uuidv7, verifyChain, withTx,
} from '../src/index.ts';
import { freshDb } from './helpers.ts';
import type { TestDb } from './helpers.ts';

let t: TestDb;
beforeAll(async () => {
  t = await freshDb();
});
afterAll(async () => {
  await t.drop();
});

const clock = new FixedClock(new Date('2026-11-06T12:00:00Z'));
const draft = (over: Record<string, unknown> = {}) => ({
  spec: { keywords: ['usb-c cable'], mustInclude: ['usb-c'] },
  quantity: 10,
  unitCeiling: '18000',
  budget: '200000',
  currency: 'USD',
  deliverBy: '2026-11-25',
  ...over,
});
const make = (over: Record<string, unknown> = {}) => withTx((tx) => createMandate(tx, draft(over), { createdBy: 'user:owner', clock }), t.db);
const auditCount = async (type: string) =>
  (await t.db.query<{ n: bigint }>('select count(*) n from audit_event where type = $1', [type])).rows[0]!.n;

describe('createMandate', () => {
  it('stores version 1 with the documented defaults, a recomputable digest and an audit row', async () => {
    const before = await auditCount('MANDATE_CREATED');
    const m = await make();
    expect(m.version).toBe(1);
    expect(m.status).toBe('ACTIVE');
    expect(m.approvalThresholdMinor).toBe(200000n); // default: the budget, so no second approver unless one is set
    expect(m.expiresAt.toISOString()).toBe('2026-11-25T23:59:59.000Z'); // default: end of the delivery day
    expect(m.minRating).toBeNull();
    expect(m.allowedDomains).toBeNull();
    expect(m.sha256).toBe(mandateSha256(m));
    expect(await auditCount('MANDATE_CREATED')).toBe(before + 1n);
    expect((await verifyChain(t.db)).ok).toBe(true);
  });

  it('keeps the digest valid after a round trip through numeric, date, timestamptz, jsonb and text[] columns', async () => {
    const created = await make({
      minRating: 4.5,
      allowedDomains: ['Zeta.com', 'alpha.com', 'zeta.com'],
      approvalThreshold: '50000',
      expiresAt: '2026-11-20T08:30:00+02:00',
      spec: { keywords: ['usb-c cable'], mustExclude: ['refurbished'] },
    });
    const read = (await getMandate(t.db, created.id, 1))!;
    expect(read.minRating).toBe(4.5);
    expect(read.allowedDomains).toEqual(['alpha.com', 'zeta.com']); // lower-cased, de-duplicated, sorted
    expect(read.expiresAt.toISOString()).toBe('2026-11-20T06:30:00.000Z');
    expect(read.deliverBy).toBe('2026-11-25'); // a plain string, not a shifted Date
    expect(mandateSha256(read)).toBe(created.sha256);
  });

  it('treats an empty allow-list as no allow-list', async () => {
    expect((await make({ allowedDomains: [] })).allowedDomains).toBeNull();
  });

  it.each([
    ['a zero budget', { budget: '0' }],
    ['a delivery date in the past', { deliverBy: '2026-11-05' }],
    ['an expiry that is not in the future', { expiresAt: '2026-11-06T12:00:00Z' }],
    ['a rating with two decimals', { minRating: 4.55 }],
    ['an empty keyword list', { spec: { keywords: [] } }],
    ['a currency other than USD', { currency: 'EUR' }],
    ['a negative-looking amount', { unitCeiling: '-1' }],
  ])('rejects %s and leaves no row and no audit entry behind', async (_name, over) => {
    const rows = (await t.db.query<{ n: bigint }>('select count(*) n from mandate')).rows[0]!.n;
    const audits = await auditCount('MANDATE_CREATED');
    await expect(make(over)).rejects.toMatchObject({ code: 'MANDATE_INVALID' });
    expect((await t.db.query<{ n: bigint }>('select count(*) n from mandate')).rows[0]!.n).toBe(rows);
    expect(await auditCount('MANDATE_CREATED')).toBe(audits);
  });

  it('exposes the gatekeeper shape: bigint money, ISO expiry, optional fields omitted when unset', async () => {
    const bare = toGateMandate(await make());
    expect(bare.unitCeiling).toBe(18000n);
    expect(bare.budget).toBe(200000n);
    expect(bare.expiresAt).toBe('2026-11-25T23:59:59.000Z');
    expect('minRating' in bare).toBe(false);
    expect('allowedDomains' in bare).toBe(false);
    const full = toGateMandate(await make({ minRating: 4, allowedDomains: ['alpha.com'] }));
    expect(full.minRating).toBe(4);
    expect(full.allowedDomains).toEqual(['alpha.com']);
  });
});

describe('versions and status', () => {
  it('amend adds version 2, leaves version 1 exactly as it was, and only the new version is current', async () => {
    const v1 = await make();
    const v2 = await withTx((tx) => amendMandate(tx, v1.id, draft({ budget: '300000' }), { amendedBy: 'user:owner', clock }), t.db);
    expect(v2.version).toBe(2);
    expect(v2.budgetMinor).toBe(300000n);
    expect(v2.sha256).not.toBe(v1.sha256);
    expect((await getMandate(t.db, v1.id, 1))).toEqual(v1);
    expect((await getCurrentMandate(t.db, v1.id))!.version).toBe(2);
    const listed = (await listMandates(t.db, { limit: 1000 })).filter((m) => m.id === v1.id);
    expect(listed.map((m) => m.version)).toEqual([2]);
    expect(await auditCount('MANDATE_AMENDED')).toBeGreaterThan(0n);
  });

  it('amending a paused mandate keeps it paused', async () => {
    const v1 = await make();
    await withTx((tx) => setMandateStatus(tx, v1.id, 'PAUSED', 'user:owner'), t.db);
    const v2 = await withTx((tx) => amendMandate(tx, v1.id, draft(), { amendedBy: 'user:owner', clock }), t.db);
    expect(v2.status).toBe('PAUSED');
  });

  it('a closed mandate cannot be amended or reopened; repeating the current status is a quiet no-op', async () => {
    const m = await make();
    await withTx((tx) => setMandateStatus(tx, m.id, 'CLOSED', 'user:owner'), t.db);
    const audits = await auditCount('MANDATE_STATUS_CHANGED');
    await withTx((tx) => setMandateStatus(tx, m.id, 'CLOSED', 'user:owner'), t.db);
    expect(await auditCount('MANDATE_STATUS_CHANGED')).toBe(audits);
    await expect(withTx((tx) => setMandateStatus(tx, m.id, 'ACTIVE', 'user:owner'), t.db)).rejects.toMatchObject({ code: 'MANDATE_NOT_ACTIVE' });
    await expect(withTx((tx) => amendMandate(tx, m.id, draft(), { amendedBy: 'user:owner', clock }), t.db)).rejects.toMatchObject({ code: 'MANDATE_NOT_ACTIVE' });
  });

  it('reports NOT_FOUND for an unknown mandate', async () => {
    await expect(withTx((tx) => amendMandate(tx, uuidv7(), draft(), { amendedBy: 'x', clock }), t.db)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(withTx((tx) => setMandateStatus(tx, uuidv7(), 'PAUSED', 'x'), t.db)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('three concurrent amendments produce three distinct versions and no primary-key collision', async () => {
    const v1 = await make();
    const amended = await Promise.all(
      [1, 2, 3].map((i) => withTx((tx) => amendMandate(tx, v1.id, draft({ quantity: 10 + i }), { amendedBy: `user:${i}`, clock }), t.db)),
    );
    expect(amended.map((m) => m.version).sort()).toEqual([2, 3, 4]);
    expect((await getCurrentMandate(t.db, v1.id))!.version).toBe(4);
  });
});

describe('spentSoFar', () => {
  const NEUTRAL = {
    productId: 'p', domain: 'alpha.com', title: 't', unitPriceMinor: 1n, quantity: 1, shippingMinor: 0n, taxMinor: 0n,
    eta: '2026-11-20', inStock: true, gatePass: true, gateResults: [], decisionSha256: 'b'.repeat(64),
  };

  it('counts orders that hold or have taken funds, across every version, and nothing else', async () => {
    const v1 = await make();
    const v2 = await withTx((tx) => amendMandate(tx, v1.id, draft(), { amendedBy: 'user:owner', clock }), t.db);
    const other = await make();

    const amounts: [OrderState, bigint, number][] = [
      ['AWAITING_APPROVAL', 1n, 1], ['HELD', 2n, 1], ['IN_TRANSIT', 4n, 1], ['DELIVERED', 8n, 2], ['SETTLED', 16n, 2],
      ['DISPUTED', 32n, 2], ['EVIDENCE_SUBMITTED', 64n, 2], ['RESOLVED_WON', 128n, 2],
      // none of these may count:
      ['GATED', 1000n, 1], ['REJECTED', 2000n, 1], ['CANCELLED', 4000n, 1], ['FAILED', 8000n, 1], ['VOIDED', 16000n, 1],
      ['REFUNDED', 32000n, 1], ['RESOLVED_LOST', 64000n, 1],
    ];
    for (const [state, amountMinor, version] of amounts) {
      await withTx(async (tx) => {
        const p = await insertProposal(tx, { ...NEUTRAL, mandateId: v1.id, mandateVersion: version });
        await insertOrder(tx, { id: uuidv7(), proposalId: p.id, state, amountMinor });
      }, t.db);
    }
    await withTx(async (tx) => {
      const p = await insertProposal(tx, { ...NEUTRAL, mandateId: other.id, mandateVersion: 1 });
      await insertOrder(tx, { id: uuidv7(), proposalId: p.id, state: 'HELD', amountMinor: 999_999n });
    }, t.db);

    expect(await spentSoFar(t.db, v1.id)).toBe(255n); // 1+2+4+8+16+32+64+128
    expect(await spentSoFar(t.db, other.id)).toBe(999_999n);
    expect(await spentSoFar(t.db, uuidv7())).toBe(0n);
    expect(v2.version).toBe(2);
  });

  it('the committed-state list is exactly the open states plus RESOLVED_WON', () => {
    expect([...BUDGET_COMMITTED_STATES].sort()).toEqual(
      ['AWAITING_APPROVAL', 'DELIVERED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'HELD', 'IN_TRANSIT', 'RESOLVED_WON', 'SETTLED'],
    );
  });
});
