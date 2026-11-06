import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getOrder, verifyChain } from '@aegis/db';
import { HONOR_PERIOD_MS, authorizeHold, createHold, getPayPalOrder, invoiceIdFor } from '../src/orders.ts';
import { paypalRequestId } from '../src/request-id.ts';
import { seedGatedOrder, startHarness } from './harness.ts';
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
  h.sleeps.length = 0;
  h.writes.enabled = true;
});

const APP = 'https://aegispay.example';
const copy = { description: 'USB-C cables for the support team' };
const hold = (s: { orderId: string; decisionSha: string }, extra: object = {}) =>
  createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy, appUrl: APP, ...extra });
const postCalls = () => h.pp.seen.filter((c) => c.method === 'POST');
const auditTypes = async (orderId: string) =>
  (await h.t.db.query<{ type: string }>(`select type from audit_event where entity_id = $1 order by seq`, [orderId])).rows.map((r) => r.type);
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as DomainError).code;

describe('createHold', () => {
  it('sends exactly what the gated rows say, with the deterministic request id and a bearer token', async () => {
    const s = await seedGatedOrder(h.t);
    const r = await hold(s);
    expect(r.reused).toBe(false);

    const call = postCalls().find((c) => c.path === '/v2/checkout/orders')!;
    expect(call.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'create_order', 1));
    expect(call.headers.authorization).toMatch(/^Bearer tok-/);
    expect(call.headers.prefer).toBe('return=representation');
    const pu = call.body.purchase_units[0];
    expect(call.body.intent).toBe('AUTHORIZE');
    expect(pu.custom_id).toBe(s.mandateSha);
    expect(pu.invoice_id).toBe(invoiceIdFor(s.orderId));
    expect(pu.description).toBe(copy.description);
    expect(pu.amount).toEqual({
      currency_code: 'USD',
      value: '140.40',
      breakdown: { item_total: { currency_code: 'USD', value: '125.00' }, shipping: { currency_code: 'USD', value: '5.00' }, tax_total: { currency_code: 'USD', value: '10.40' } },
    });
    expect(pu.items).toHaveLength(1);
    expect(pu.items[0]).toMatchObject({ name: 'USB-C cable 2m', sku: 'sku-1', quantity: '10', category: 'PHYSICAL_GOODS', unit_amount: { currency_code: 'USD', value: '12.50' }, tax: { currency_code: 'USD', value: '1.04' } });
    expect(call.body.payment_source.paypal.experience_context).toMatchObject({ return_url: `${APP}/approved`, cancel_url: `${APP}/cancelled`, user_action: 'CONTINUE' });

    const row = await getOrder(h.t.db, s.orderId);
    expect(row!.paypalOrderId).toBe(r.paypalOrderId);
    expect(row!.state).toBe('AWAITING_APPROVAL');
  });

  it('records PAYPAL_CALL then HOLD_CREATED in a verifiable hash chain', async () => {
    const s = await seedGatedOrder(h.t);
    await hold(s);
    expect(await auditTypes(s.orderId)).toEqual(['PAYPAL_CALL', 'HOLD_CREATED']);
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('is idempotent: a second call returns the stored id with no network traffic', async () => {
    const s = await seedGatedOrder(h.t);
    const a = await hold(s);
    h.pp.seen.length = 0;
    const b = await hold(s);
    expect(b).toEqual({ paypalOrderId: a.paypalOrderId, reused: true });
    expect(h.pp.seen).toHaveLength(0);
  });

  it('two concurrent calls agree on one PayPal order id (PayPal-Request-Id makes the retry return the original)', async () => {
    h.pp.delayMs = 40;
    const s = await seedGatedOrder(h.t);
    const [a, b] = await Promise.all([hold(s), hold(s)]);
    h.pp.delayMs = 0;
    expect(a.paypalOrderId).toBe(b.paypalOrderId);
    const creates = postCalls().filter((c) => c.path === '/v2/checkout/orders');
    expect(creates.every((c) => c.headers['paypal-request-id'] === paypalRequestId(s.orderId, 'create_order', 1))).toBe(true);
    expect((await getOrder(h.t.db, s.orderId))!.paypalOrderId).toBe(a.paypalOrderId);
  });

  it('sends tax_total only (no item tax) when the tax does not divide across the quantity', async () => {
    const s = await seedGatedOrder(h.t, { quantity: 7, tax: 1000n });
    await hold(s);
    const pu = postCalls().find((c) => c.path === '/v2/checkout/orders')!.body.purchase_units[0];
    expect(pu.items[0].tax).toBeUndefined();
    expect(pu.amount.breakdown.tax_total.value).toBe('10.00');
  });

  it('omits tax entirely when there is none', async () => {
    const s = await seedGatedOrder(h.t, { tax: 0n });
    await hold(s);
    const pu = postCalls().find((c) => c.path === '/v2/checkout/orders')!.body.purchase_units[0];
    expect(pu.items[0].tax).toBeUndefined();
    expect(pu.amount.breakdown.tax_total).toBeUndefined();
    expect(pu.amount.value).toBe('130.00');
  });

  it('caps free text at PayPal limits (description 127, title 127)', async () => {
    const s = await seedGatedOrder(h.t, { title: 'T'.repeat(300) });
    await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'D'.repeat(500) }, appUrl: APP });
    const pu = postCalls().find((c) => c.path === '/v2/checkout/orders')!.body.purchase_units[0];
    expect(pu.description).toHaveLength(127);
    expect(pu.items[0].name).toHaveLength(127);
  });

  describe('refuses before any network call', () => {
    it('unknown order', async () => {
      expect(await code(createHold(h.ctx, { orderRowId: '00000000-0000-7000-8000-000000000000', decisionSha256: 'x'.repeat(64), copy, appUrl: APP }))).toBe('NOT_FOUND');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('order not AWAITING_APPROVAL', async () => {
      const s = await seedGatedOrder(h.t, { state: 'GATED' });
      expect(await code(hold(s))).toBe('BAD_STATE');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('proposal that did not pass the gate', async () => {
      const s = await seedGatedOrder(h.t, { gatePass: false });
      expect(await code(hold(s))).toBe('GATE_FAILED');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('a decision hash that is not the stored one', async () => {
      const s = await seedGatedOrder(h.t);
      expect(await code(hold({ ...s, decisionSha: 'f'.repeat(64) }))).toBe('DECISION_STALE');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('a mandate that is no longer ACTIVE', async () => {
      const s = await seedGatedOrder(h.t, { mandateStatus: 'PAUSED' });
      expect(await code(hold(s))).toBe('MANDATE_NOT_ACTIVE');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('an order amount that disagrees with the recomputed total', async () => {
      const s = await seedGatedOrder(h.t, { amountMinor: 99999n });
      expect(await code(hold(s))).toBe('AMOUNT_MISMATCH');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('a caller total that disagrees with the stored total', async () => {
      const s = await seedGatedOrder(h.t);
      expect(await code(hold(s, { expectedTotal: s.total + 1n }))).toBe('AMOUNT_MISMATCH');
      expect(h.pp.seen).toHaveLength(0);
    });
    it('the kill switch being off (and audits the refusal)', async () => {
      const s = await seedGatedOrder(h.t);
      h.writes.enabled = false;
      expect(await code(hold(s))).toBe('WRITES_DISABLED');
      expect(h.pp.seen).toHaveLength(0);
      expect(await auditTypes(s.orderId)).toEqual(['PAYPAL_CALL_BLOCKED']);
      expect((await getOrder(h.t.db, s.orderId))!.paypalOrderId).toBeNull();
    });
  });

  describe('PayPal failures', () => {
    it('a 422 is final: PAYPAL_ERROR with the issue name and debug id, nothing recorded, no retry', async () => {
      const s = await seedGatedOrder(h.t);
      h.pp.failures.push({
        match: /POST \/v2\/checkout\/orders$/,
        count: 1,
        status: 422,
        body: { name: 'UNPROCESSABLE_ENTITY', message: 'bad', debug_id: 'dbg-x', details: [{ issue: 'ITEM_TOTAL_MISMATCH' }] },
      });
      const err = (await hold(s).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('PAYPAL_ERROR');
      expect(err.paypalName).toBe('UNPROCESSABLE_ENTITY');
      // the paypal-debug-id response header wins over the body's debug_id
      expect(err.paypalDebugId).toMatch(/^dbg-\d+$/);
      expect(h.sleeps).toEqual([]);
      expect((await getOrder(h.t.db, s.orderId))!.paypalOrderId).toBeNull();
    });

    it('a 500 is retried with the SAME request id and then succeeds', async () => {
      const s = await seedGatedOrder(h.t);
      h.pp.failures.push({ match: /POST \/v2\/checkout\/orders$/, count: 1, status: 500 });
      const r = await hold(s);
      const calls = postCalls().filter((c) => c.path === '/v2/checkout/orders');
      expect(calls).toHaveLength(2);
      expect(calls[0]!.headers['paypal-request-id']).toBe(calls[1]!.headers['paypal-request-id']);
      expect(h.sleeps).toEqual([1000]);
      expect(r.paypalOrderId).toMatch(/^ORDER-/);
    });

    it('a 401 refreshes the OAuth token once and retries', async () => {
      const s = await seedGatedOrder(h.t);
      const before = h.ctx.vault.refreshCount;
      h.pp.failures.push({ match: /POST \/v2\/checkout\/orders$/, count: 1, status: 401, body: { name: 'AUTHENTICATION_FAILURE', message: 'expired', debug_id: 'dbg-401' } });
      await hold(s);
      expect(h.ctx.vault.refreshCount).toBe(before + 1);
      const tokens = postCalls().filter((c) => c.path === '/v2/checkout/orders').map((c) => c.headers.authorization);
      expect(new Set(tokens).size).toBe(2);
    });

    it('refuses to record an order whose echoed amount differs from the request', async () => {
      const s = await seedGatedOrder(h.t);
      h.pp.failures.push({
        match: /POST \/v2\/checkout\/orders$/,
        count: 1,
        status: 201,
        body: { id: 'ORDER-X', status: 'PAYER_ACTION_REQUIRED', purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }] },
      });
      expect(await code(hold(s))).toBe('AMOUNT_MISMATCH');
      expect((await getOrder(h.t.db, s.orderId))!.paypalOrderId).toBeNull();
    });
  });
});

describe('authorizeHold', () => {
  async function approved(opts = {}) {
    const s = await seedGatedOrder(h.t, opts);
    const { paypalOrderId } = await hold(s);
    h.pp.approve(paypalOrderId);
    return { ...s, paypalOrderId };
  }

  it('authorizes the approved order and moves it to HELD with the real authorization facts', async () => {
    const s = await approved();
    const r = await authorizeHold(h.ctx, s.orderId, s.paypalOrderId, { approvedBy: 'owner@acme.test' });

    const auth = h.pp.auths.get(r.authorizationId)!;
    expect(auth.status).toBe('CREATED');
    const row = (await getOrder(h.t.db, s.orderId))!;
    expect(row.state).toBe('HELD');
    expect(row.authorizationId).toBe(r.authorizationId);
    expect(row.authorizationHistory).toEqual([r.authorizationId]);
    expect(row.authExpiresAt!.toISOString()).toBe(new Date(auth.expiration_time).toISOString());
    expect(row.honorEndsAt!.getTime()).toBe(new Date(auth.create_time).getTime() + HONOR_PERIOD_MS);
    expect(row.payerId).toBe('PAYER123');
    expect(row.approvedBy).toBe('owner@acme.test');
    expect(row.approvedAt).not.toBeNull();

    const call = postCalls().find((c) => c.path.endsWith('/authorize'))!;
    expect(call.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'authorize', 1));
    expect(await auditTypes(s.orderId)).toEqual(['PAYPAL_CALL', 'HOLD_CREATED', 'PAYPAL_CALL', 'HOLD_AUTHORIZED']);
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('ORDER_NOT_APPROVED when the buyer has not approved; the order stays AWAITING_APPROVAL', async () => {
    const s = await seedGatedOrder(h.t);
    const { paypalOrderId } = await hold(s);
    const err = (await authorizeHold(h.ctx, s.orderId, paypalOrderId).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('ORDER_NOT_APPROVED');
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('AWAITING_APPROVAL');
  });

  it('is idempotent once HELD: returns the stored authorization without calling PayPal', async () => {
    const s = await approved();
    const a = await authorizeHold(h.ctx, s.orderId, s.paypalOrderId);
    h.pp.seen.length = 0;
    const b = await authorizeHold(h.ctx, s.orderId, s.paypalOrderId);
    expect(b.authorizationId).toBe(a.authorizationId);
    expect(h.pp.seen).toHaveLength(0);
  });

  it('recovers when PayPal already authorized the order (a lost response): ORDER_ALREADY_AUTHORIZED -> GET', async () => {
    const s = await approved();
    const res = await fetch(`${h.pp.baseUrl}/v2/checkout/orders/${s.paypalOrderId}/authorize`, {
      method: 'POST',
      headers: { authorization: 'Bearer tok-test', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(201);
    const r = await authorizeHold(h.ctx, s.orderId, s.paypalOrderId);
    expect(r.authorizationId).toBe(h.pp.orders.get(s.paypalOrderId)!.authId);
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('HELD');
    expect(h.pp.seen.some((c) => c.method === 'GET' && c.path === `/v2/checkout/orders/${s.paypalOrderId}`)).toBe(true);
  });

  it('rejects a PayPal order id that is not this order’s', async () => {
    const s = await approved();
    const other = await approved();
    expect(await code(authorizeHold(h.ctx, s.orderId, other.paypalOrderId))).toBe('VALIDATION');
  });

  it('rejects an order that has no PayPal order yet', async () => {
    const s = await seedGatedOrder(h.t);
    expect(await code(authorizeHold(h.ctx, s.orderId, 'ORDER-1'))).toBe('VALIDATION');
  });

  it('refuses to record an authorization for a different amount than the gated one', async () => {
    const s = await approved();
    h.pp.orders.get(s.paypalOrderId)!.request.purchase_units[0].amount.value = '999.00';
    expect(await code(authorizeHold(h.ctx, s.orderId, s.paypalOrderId))).toBe('AMOUNT_MISMATCH');
    const row = (await getOrder(h.t.db, s.orderId))!;
    expect(row.state).toBe('AWAITING_APPROVAL');
    expect(row.authorizationId).toBeNull();
  });

  it('two concurrent authorizations end with one HELD row and one hold audit event', async () => {
    h.pp.delayMs = 30;
    const s = await approved();
    const results = await Promise.allSettled([authorizeHold(h.ctx, s.orderId, s.paypalOrderId), authorizeHold(h.ctx, s.orderId, s.paypalOrderId)]);
    h.pp.delayMs = 0;
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('HELD');
    expect((await auditTypes(s.orderId)).filter((t) => t === 'HOLD_AUTHORIZED')).toHaveLength(1);
  });

  it('honours the kill switch', async () => {
    const s = await approved();
    h.writes.enabled = false;
    expect(await code(authorizeHold(h.ctx, s.orderId, s.paypalOrderId))).toBe('WRITES_DISABLED');
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('AWAITING_APPROVAL');
  });
});

describe('getPayPalOrder', () => {
  it('reads the live order and works with writes disabled (reads are not gated)', async () => {
    const s = await seedGatedOrder(h.t);
    const { paypalOrderId } = await hold(s);
    h.writes.enabled = false;
    const o = await getPayPalOrder(h.ctx, s.orderId, paypalOrderId);
    expect(o.id).toBe(paypalOrderId);
    expect(o.status).toBe('PAYER_ACTION_REQUIRED');
  });
});
