import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@aegis/core';
import {
  amendMandate, auditHeadSeq, createMandate, createOrderFromProposal, getFulfillment, getOrder, getOrderGridRow,
  insertProposal, listAuditAfter, listAuditForEntity, listOrderGrid, recordDelivery, recordShipment, setMandateStatus,
  transition, uuidv7, verifyChain, withTx,
} from '../src/index.ts';
import type { MandateRecord, NewProposal } from '../src/index.ts';
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
  spec: { keywords: ['usb-c cable'] },
  quantity: 10,
  unitCeiling: '18000',
  budget: '200000',
  currency: 'USD',
  deliverBy: '2026-11-25',
  ...over,
});
const mandate = (over: Record<string, unknown> = {}) => withTx((tx) => createMandate(tx, draft(over), { createdBy: 'user:owner', clock }), t.db);
/** 10 x 12.50 + 5.00 shipping + 10.40 tax = 140.40 */
const TOTAL = 14040n;
const propose = (m: MandateRecord, over: Partial<NewProposal> = {}) =>
  withTx(
    (tx) =>
      insertProposal(tx, {
        mandateId: m.id, mandateVersion: m.version, productId: 'sku-1', domain: 'example.com', title: 'USB-C cable 2m',
        unitPriceMinor: 1250n, quantity: 10, shippingMinor: 500n, taxMinor: 1040n, eta: '2026-11-20', inStock: true,
        gatePass: true, gateResults: [], decisionSha256: randomBytes(32).toString('hex'), ...over,
      }),
    t.db,
  );
const create = (proposalId: string, c = clock) => withTx((tx) => createOrderFromProposal(tx, proposalId, { actor: 'user:owner', clock: c }), t.db);
const count = async (sql: string, args: unknown[] = []) => Number((await t.db.query<{ n: string }>(sql, args)).rows[0]!.n);
const orderCount = () => count('select count(*) n from purchase_order');
const audits = (type: string, entityId?: string) =>
  count(`select count(*) n from audit_event where type = $1 ${entityId ? 'and entity_id = $2' : ''}`, entityId ? [type, entityId] : [type]);

/** An order that has been through createOrderFromProposal and then (as payments would do) been authorised. */
async function held() {
  const m = await mandate();
  const p = await propose(m);
  const { order } = await create(p.id);
  await withTx((tx) => transition(tx, order.id, ['AWAITING_APPROVAL'], 'HELD'), t.db);
  return { m, p, orderId: order.id };
}

describe('createOrderFromProposal', () => {
  it('creates an AWAITING_APPROVAL order for the exact gated amount and audits it with the hashes it was gated on', async () => {
    const m = await mandate();
    const p = await propose(m);
    const { order, created } = await create(p.id);
    expect(created).toBe(true);
    expect(order.state).toBe('AWAITING_APPROVAL');
    expect(order.amountMinor).toBe(TOTAL);
    expect(order.proposalId).toBe(p.id);
    expect(await audits('ORDER_CREATED', order.id)).toBe(1);
    const [row] = await listAuditForEntity(t.db, order.id);
    expect(row!.payload).toMatchObject({ proposalId: p.id, amountMinor: '14040', decisionSha256: p.decisionSha256, mandateSha256: m.sha256, mandateVersion: 1 });
    expect((await verifyChain(t.db)).ok).toBe(true);
  });

  it('is idempotent: a second call returns the same order and writes nothing', async () => {
    const m = await mandate();
    const p = await propose(m);
    const first = await create(p.id);
    const audited = await audits('ORDER_CREATED');
    const second = await create(p.id);
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(await audits('ORDER_CREATED')).toBe(audited);
  });

  it('two simultaneous clicks on one proposal yield one order', async () => {
    const m = await mandate();
    const p = await propose(m);
    const before = await orderCount();
    const [a, b] = await Promise.all([create(p.id), create(p.id)]);
    expect(a.order.id).toBe(b.order.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(await orderCount()).toBe(before + 1);
  });

  it('refuses a proposal that failed the gate', async () => {
    const p = await propose(await mandate(), { gatePass: false });
    const before = await orderCount();
    await expect(create(p.id)).rejects.toMatchObject({ code: 'GATE_FAILED' });
    expect(await orderCount()).toBe(before);
  });

  it('refuses an unknown proposal', async () => {
    await expect(create(uuidv7())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses once the mandate was amended (R2): the proposal was judged on terms that no longer exist', async () => {
    const m = await mandate();
    const p = await propose(m);
    await withTx((tx) => amendMandate(tx, m.id, draft({ budget: '300000' }), { amendedBy: 'user:owner', clock }), t.db);
    const err = await create(p.id).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'DECISION_STALE', details: [{ rule: 'R2' }] });
  });

  it.each(['PAUSED', 'CLOSED'] as const)('refuses a %s mandate', async (status) => {
    const m = await mandate();
    const p = await propose(m);
    await withTx((tx) => setMandateStatus(tx, m.id, status, 'user:owner'), t.db);
    await expect(create(p.id)).rejects.toMatchObject({ code: 'MANDATE_NOT_ACTIVE' });
  });

  it('refuses an expired mandate', async () => {
    const p = await propose(await mandate());
    await expect(create(p.id, new FixedClock(new Date('2026-11-26T00:00:00Z')))).rejects.toMatchObject({ code: 'MANDATE_NOT_ACTIVE' });
  });

  it('refuses an order that would exceed the budget (R6) and leaves no row; a smaller one still fits', async () => {
    const m = await mandate({ budget: '20000' }); // $200: one $140.40 order fits, two do not
    const first = await propose(m);
    const second = await propose(m);
    await create(first.id);
    const before = await orderCount();
    const err = await create(second.id).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'GATE_FAILED', details: [{ rule: 'R6', actual: '28080' }] });
    expect(await orderCount()).toBe(before);
    const small = await propose(m, { quantity: 4, unitPriceMinor: 1000n, shippingMinor: 100n, taxMinor: 100n }); // $42.00 -> 14040 + 4200 <= 20000
    expect((await create(small.id)).order.amountMinor).toBe(4200n);
  });

  it('two orders racing for the last of the budget: exactly one wins', async () => {
    const m = await mandate({ budget: '20000' });
    const [a, b] = await Promise.all([propose(m), propose(m)]);
    const results = await Promise.allSettled([create(a.id), create(b.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'GATE_FAILED' });
  });
});

describe('recordShipment', () => {
  it('moves HELD to IN_TRANSIT, stores a SIMULATED carrier record and audits it', async () => {
    const { orderId } = await held();
    const r = await withTx((tx) => recordShipment(tx, orderId, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784', actor: 'user:owner', clock }), t.db);
    expect(r.applied).toBe(true);
    expect(r.order.state).toBe('IN_TRANSIT');
    const f = (await getFulfillment(t.db, orderId))!;
    expect(f).toMatchObject({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784', source: 'SIMULATED', deliveredAt: null });
    expect(f.shippedAt?.toISOString()).toBe('2026-11-06T12:00:00.000Z');
    expect(await audits('SHIPPED', orderId)).toBe(1);
  });

  it('repeating it changes nothing', async () => {
    const { orderId } = await held();
    const ship = () => withTx((tx) => recordShipment(tx, orderId, { carrier: 'UPS', trackingNumber: 'TRACK-0001', actor: 'user:owner', clock }), t.db);
    await ship();
    const again = await ship();
    expect(again.applied).toBe(false);
    expect(await audits('SHIPPED', orderId)).toBe(1);
  });

  it('refuses an order that is not HELD and writes no carrier record', async () => {
    const m = await mandate();
    const { order } = await create((await propose(m)).id); // AWAITING_APPROVAL: nothing is held yet
    await expect(withTx((tx) => recordShipment(tx, order.id, { carrier: 'UPS', trackingNumber: 'TRACK-0002', actor: 'user:owner', clock }), t.db)).rejects.toMatchObject({ code: 'BAD_STATE' });
    expect(await getFulfillment(t.db, order.id)).toBeNull();
  });
});

describe('recordDelivery', () => {
  const shipped = async () => {
    const h = await held();
    await withTx((tx) => recordShipment(tx, h.orderId, { carrier: 'UPS', trackingNumber: 'TRACK-0003', actor: 'user:owner', clock }), t.db);
    return h;
  };

  it('moves IN_TRANSIT to DELIVERED, stamps delivered_at and audits it as simulated', async () => {
    const { orderId } = await shipped();
    const later = new FixedClock(new Date('2026-11-10T09:00:00Z'));
    const r = await withTx((tx) => recordDelivery(tx, orderId, { actor: 'user:owner', clock: later }), t.db);
    expect(r.applied).toBe(true);
    expect(r.order.state).toBe('DELIVERED');
    expect((await getFulfillment(t.db, orderId))!.deliveredAt?.toISOString()).toBe('2026-11-10T09:00:00.000Z');
    const row = (await listAuditForEntity(t.db, orderId)).find((a) => a.type === 'DELIVERED')!;
    expect(row.payload).toMatchObject({ source: 'SIMULATED' });
  });

  it('repeating it reports applied:false (so the caller can still make sure capture is queued) and writes nothing', async () => {
    const { orderId } = await shipped();
    await withTx((tx) => recordDelivery(tx, orderId, { actor: 'user:owner', clock }), t.db);
    const again = await withTx((tx) => recordDelivery(tx, orderId, { actor: 'user:owner', clock }), t.db);
    expect(again).toMatchObject({ applied: false, order: { state: 'DELIVERED' } });
    expect(await audits('DELIVERED', orderId)).toBe(1);
  });

  it('refuses a delivery dated after the mandate deliver-by day (SLA_PASSED) and leaves the order in transit', async () => {
    const { orderId } = await shipped();
    const late = new FixedClock(new Date('2026-11-26T00:00:01Z'));
    await expect(withTx((tx) => recordDelivery(tx, orderId, { actor: 'user:owner', clock: late }), t.db)).rejects.toMatchObject({ code: 'SLA_PASSED' });
    expect((await getOrder(t.db, orderId))!.state).toBe('IN_TRANSIT');
    expect((await getFulfillment(t.db, orderId))!.deliveredAt).toBeNull();
  });

  it('accepts a delivery on the deliver-by day itself', async () => {
    const { orderId } = await shipped();
    const lastDay = new FixedClock(new Date('2026-11-25T23:59:59Z'));
    expect((await withTx((tx) => recordDelivery(tx, orderId, { actor: 'user:owner', clock: lastDay }), t.db)).applied).toBe(true);
  });

  it('refuses an order that is not in transit, and an unknown one', async () => {
    const { orderId } = await held();
    await expect(withTx((tx) => recordDelivery(tx, orderId, { actor: 'user:owner', clock }), t.db)).rejects.toMatchObject({ code: 'BAD_STATE' });
    await expect(withTx((tx) => recordDelivery(tx, uuidv7(), { actor: 'user:owner', clock }), t.db)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('read models', () => {
  it('the grid row joins proposal, mandate, carrier record and dispute', async () => {
    const { orderId, p, m } = await held();
    await withTx((tx) => recordShipment(tx, orderId, { carrier: 'FEDEX', trackingNumber: 'TRACK-0004', actor: 'user:owner', clock }), t.db);
    const row = (await getOrderGridRow(t.db, orderId))!;
    expect(row).toMatchObject({
      id: orderId, state: 'IN_TRANSIT', amountMinor: TOTAL, mandateId: m.id, mandateVersion: 1, deliverBy: '2026-11-25',
      title: 'USB-C cable 2m', gatePass: true, decisionSha256: p.decisionSha256, carrier: 'FEDEX', trackingNumber: 'TRACK-0004',
      fulfillmentSource: 'SIMULATED', disputeId: null, disputeStatus: null,
    });
    expect((await listOrderGrid(t.db)).some((r) => r.id === orderId)).toBe(true);
    expect(await getOrderGridRow(t.db, uuidv7())).toBeNull();
  });

  it('shows the latest dispute on an order', async () => {
    const { orderId } = await held();
    await t.db.query(`insert into dispute (paypal_dispute_id, order_id, status, updated_at) values ($1, $2, 'OPEN', now() - interval '1 hour'), ($3, $2, 'WAITING_FOR_SELLER_RESPONSE', now())`, [`PP-D-${uuidv7()}`, orderId, `PP-D-${uuidv7()}`]);
    expect((await getOrderGridRow(t.db, orderId))!.disputeStatus).toBe('WAITING_FOR_SELLER_RESPONSE');
  });

  it('audit listing is per entity and oldest first; listAuditAfter pages by sequence number', async () => {
    const { orderId } = await held();
    await withTx((tx) => recordShipment(tx, orderId, { carrier: 'UPS', trackingNumber: 'TRACK-0005', actor: 'user:owner', clock }), t.db);
    const rows = await listAuditForEntity(t.db, orderId);
    expect(rows.map((r) => r.type)).toEqual(['ORDER_CREATED', 'SHIPPED']);
    expect(rows[0]!.seq < rows[1]!.seq).toBe(true);

    const head = await auditHeadSeq(t.db);
    expect(await listAuditAfter(t.db, head)).toEqual([]);
    const after = await listAuditAfter(t.db, rows[0]!.seq - 1n, 2);
    expect(after.map((r) => r.seq)).toEqual([rows[0]!.seq, rows[0]!.seq + 1n]);
    expect(after[0]!.hash).toBe(rows[0]!.hash);
  });

  it('auditHeadSeq is zero on an empty log', async () => {
    const empty = await freshDb();
    try {
      expect(await auditHeadSeq(empty.db)).toBe(0n);
    } finally {
      await empty.drop();
    }
  });
});
