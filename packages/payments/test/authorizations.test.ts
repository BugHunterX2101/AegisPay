import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getOrder, transition, verifyChain, withTx } from '@aegis/db';
import { REAUTH_AFTER_HONOR_MS, capture, reauthDue, reauthorize, voidHold } from '../src/authorizations.ts';
import { authorizeHold, createHold, pushTracking } from '../src/orders.ts';
import { paypalRequestId } from '../src/request-id.ts';
import { seedFulfillment, seedGatedOrder, startHarness } from './harness.ts';
import type { Harness, SeedOptions } from './harness.ts';

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
  h.pp.delayMs = 0;
  h.sleeps.length = 0;
  h.writes.enabled = true;
  h.clock.offsetMs = 0;
});

const APP = 'https://aegispay.example';
const posts = (suffix: string) => h.pp.seen.filter((c) => c.method === 'POST' && c.path.endsWith(suffix));
const auditTypes = async (orderId: string) =>
  (await h.t.db.query<{ type: string }>(`select type from audit_event where entity_id = $1 order by seq`, [orderId])).rows.map((r) => r.type);
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as DomainError).code;
const orderState = async (id: string) => (await getOrder(h.t.db, id))!.state;

/** A real hold: gated order → PayPal order → buyer approval → authorization (state HELD). */
async function held(opts: SeedOptions = {}) {
  const s = await seedGatedOrder(h.t, opts);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'USB-C cables' }, appUrl: APP });
  h.pp.approve(paypalOrderId);
  const a = await authorizeHold(h.ctx, s.orderId, paypalOrderId, { approvedBy: 'owner@acme.test' });
  h.pp.seen.length = 0;
  return { ...s, paypalOrderId, authorizationId: a.authorizationId };
}

const advance = (orderId: string, from: 'HELD' | 'IN_TRANSIT', to: 'IN_TRANSIT' | 'DELIVERED') =>
  withTx((tx) => transition(tx, orderId, [from], to), h.t.db);

/** HELD → IN_TRANSIT → DELIVERED with a carrier record, as the (simulated) fulfillment feed leaves it. */
async function delivered(opts: SeedOptions = {}, f: { carrier?: string; trackingNumber?: string; deliveredAt?: Date | null } = {}) {
  const s = await held(opts);
  await advance(s.orderId, 'HELD', 'IN_TRANSIT');
  await advance(s.orderId, 'IN_TRANSIT', 'DELIVERED');
  await seedFulfillment(h.t, s.orderId, f);
  return s;
}

describe('capture', () => {
  it('captures the exact authorized amount as a final capture and settles the order', async () => {
    const s = await delivered();
    const r = await capture(h.ctx, s.orderId);
    expect(r).toMatchObject({ status: 'COMPLETED', reused: false });

    const call = posts('/capture')[0]!;
    expect(call.path).toBe(`/v2/payments/authorizations/${s.authorizationId}/capture`);
    expect(call.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'capture', 1));
    expect(call.body).toEqual({ final_capture: true, amount: { currency_code: 'USD', value: '140.40' } });

    const row = (await getOrder(h.t.db, s.orderId))!;
    expect(row.state).toBe('SETTLED');
    expect(row.captureId).toBe(r.captureId);
    expect(h.pp.auths.get(s.authorizationId)!.status).toBe('CAPTURED');
  });

  it('re-reads PayPal before capturing (proof gate runs on live data)', async () => {
    const s = await delivered();
    await capture(h.ctx, s.orderId);
    const gets = h.pp.seen.filter((c) => c.method === 'GET' && c.path === `/v2/payments/authorizations/${s.authorizationId}`);
    expect(gets).toHaveLength(1);
    expect(h.pp.seen.findIndex((c) => c.method === 'GET')).toBeLessThan(h.pp.seen.findIndex((c) => c.path.endsWith('/capture')));
  });

  it('writes a CAPTURED audit event carrying the proof, and the chain verifies', async () => {
    const s = await delivered({}, { carrier: 'FEDEX', trackingNumber: '794644790132' });
    await capture(h.ctx, s.orderId);
    expect(await auditTypes(s.orderId)).toContain('CAPTURED');
    const ev = (await h.t.db.query<{ payload: Record<string, string>; paypal_request_id: string | null }>(
      `select payload, paypal_request_id from audit_event where entity_id = $1 and type = 'CAPTURED'`,
      [s.orderId],
    )).rows[0]!;
    expect(ev.payload).toMatchObject({ carrier: 'FEDEX', trackingNumber: '794644790132', amountMinor: '14040', fulfillmentSource: 'SIMULATED' });
    expect(ev.paypal_request_id).toBe(paypalRequestId(s.orderId, 'capture', 1));
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('is idempotent: a settled order returns the stored capture with no network traffic', async () => {
    const s = await delivered();
    const a = await capture(h.ctx, s.orderId);
    h.pp.seen.length = 0;
    const b = await capture(h.ctx, s.orderId);
    expect(b).toEqual({ captureId: a.captureId, status: 'COMPLETED', reused: true });
    expect(h.pp.seen).toHaveLength(0);
  });

  it('two concurrent captures converge on one capture and one CAPTURED audit event', async () => {
    h.pp.delayMs = 40;
    const s = await delivered();
    h.pp.seen.length = 0;
    const [a, b] = await Promise.all([capture(h.ctx, s.orderId), capture(h.ctx, s.orderId)]);
    h.pp.delayMs = 0;
    expect(a.captureId).toBe(b.captureId);
    expect(posts('/capture').every((c) => c.headers['paypal-request-id'] === paypalRequestId(s.orderId, 'capture', 1))).toBe(true);
    expect((await auditTypes(s.orderId)).filter((t) => t === 'CAPTURED')).toHaveLength(1);
    expect(h.pp.orders.get(s.paypalOrderId)!.captureIds).toHaveLength(1);
  });

  describe('proof gate: nothing reaches PayPal when a condition fails', () => {
    const noCapture = () => expect(posts('/capture')).toHaveLength(0);

    it('refuses an order that is not DELIVERED', async () => {
      const s = await held();
      expect(await code(capture(h.ctx, s.orderId))).toBe('BAD_STATE');
      noCapture();
      expect(await orderState(s.orderId)).toBe('HELD');
      expect(await auditTypes(s.orderId)).toContain('CAPTURE_BLOCKED');
    });

    it('refuses without a fulfillment record', async () => {
      const s = await held();
      await advance(s.orderId, 'HELD', 'IN_TRANSIT');
      await advance(s.orderId, 'IN_TRANSIT', 'DELIVERED');
      const err = (await capture(h.ctx, s.orderId).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('PROOF_GATE_FAILED');
      expect(JSON.stringify(err.details)).toContain('no fulfillment record');
      noCapture();
    });

    it('refuses a fulfillment with no delivery timestamp', async () => {
      const s = await delivered({}, { deliveredAt: null });
      const err = (await capture(h.ctx, s.orderId).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('PROOF_GATE_FAILED');
      expect(JSON.stringify(err.details)).toContain('delivered_at missing');
      noCapture();
      expect(await orderState(s.orderId)).toBe('DELIVERED');
    });

    it('refuses a delivery recorded after the mandate deadline', async () => {
      const s = await delivered({}, { deliveredAt: new Date('2036-12-30T00:00:00Z') });
      expect(await code(capture(h.ctx, s.orderId))).toBe('SLA_PASSED');
      noCapture();
    });

    it('accepts a delivery on the deadline day itself', async () => {
      const s = await delivered({ deliverBy: '2036-11-25' }, { deliveredAt: new Date('2036-11-25T23:59:00Z') });
      expect((await capture(h.ctx, s.orderId)).status).toBe('COMPLETED');
    });

    it('refuses when the stored amount no longer equals the recomputed total', async () => {
      const s = await delivered();
      await h.t.db.query(`update purchase_order set amount_minor = amount_minor + 1 where id = $1`, [s.orderId]);
      expect(await code(capture(h.ctx, s.orderId))).toBe('AMOUNT_MISMATCH');
      noCapture();
    });

    it('refuses when PayPal says the authorization was voided out-of-band', async () => {
      const s = await delivered();
      h.pp.auths.get(s.authorizationId)!.status = 'VOIDED';
      const err = (await capture(h.ctx, s.orderId).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('PROOF_GATE_FAILED');
      expect(JSON.stringify(err.details)).toContain('VOIDED');
      noCapture();
    });

    it('refuses when the live authorization has expired', async () => {
      const s = await delivered();
      h.pp.auths.get(s.authorizationId)!.expiration_time = new Date(Date.now() - 1000).toISOString();
      const err = (await capture(h.ctx, s.orderId).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('PROOF_GATE_FAILED');
      expect(JSON.stringify(err.details)).toContain('expired');
      noCapture();
    });

    it('refuses when PayPal holds a different amount than the order', async () => {
      const s = await delivered();
      h.pp.auths.get(s.authorizationId)!.amount.value = '1.00';
      const err = (await capture(h.ctx, s.orderId).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('PROOF_GATE_FAILED');
      expect(JSON.stringify(err.details)).toContain('amount');
      noCapture();
    });

    it('reports ALREADY_CAPTURED when PayPal already captured it out-of-band', async () => {
      const s = await delivered();
      h.pp.auths.get(s.authorizationId)!.status = 'CAPTURED';
      expect(await code(capture(h.ctx, s.orderId))).toBe('ALREADY_CAPTURED');
      noCapture();
      expect(await orderState(s.orderId)).toBe('DELIVERED');
    });

    it('audits every refusal as CAPTURE_BLOCKED and keeps the chain valid', async () => {
      const s = await held();
      await capture(h.ctx, s.orderId).catch(() => undefined);
      expect((await auditTypes(s.orderId)).at(-1)).toBe('CAPTURE_BLOCKED');
      expect((await verifyChain(h.t.db)).ok).toBe(true);
    });
  });

  describe('PayPal failure handling', () => {
    it('retries a 5xx with the SAME request id and then settles', async () => {
      const s = await delivered();
      h.pp.failures.push({ match: /POST \/v2\/payments\/authorizations\/.+\/capture$/, count: 2, status: 500 });
      const r = await capture(h.ctx, s.orderId);
      expect(r.status).toBe('COMPLETED');
      const ids = posts('/capture').map((c) => c.headers['paypal-request-id']);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(1);
      expect(h.sleeps).toHaveLength(2);
    });

    it('a capture lost after PayPal applied it converges through the idempotent request id', async () => {
      const s = await delivered();
      await capture(h.ctx, s.orderId); // PayPal captured and we stored it
      // simulate "we never stored the result": put the order back to DELIVERED and call again
      await h.t.db.query(`update purchase_order set state = 'DELIVERED', capture_id = null where id = $1`, [s.orderId]);
      h.pp.auths.get(s.authorizationId)!.status = 'CREATED'; // gate sees a usable authorization again
      const r = await capture(h.ctx, s.orderId);
      expect(r.status).toBe('COMPLETED');
      expect(h.pp.orders.get(s.paypalOrderId)!.captureIds).toHaveLength(1); // PayPal returned the original capture
    });

    it('maps PayPal AUTHORIZATION_ALREADY_CAPTURED on the capture call to ALREADY_CAPTURED and leaves the order alone', async () => {
      const s = await delivered();
      h.pp.failures.push({
        match: /POST \/v2\/payments\/authorizations\/.+\/capture$/,
        count: 1,
        status: 422,
        body: { name: 'UNPROCESSABLE_ENTITY', message: 'x', details: [{ issue: 'AUTHORIZATION_ALREADY_CAPTURED' }] },
      });
      const err = (await capture(h.ctx, s.orderId).catch((e: unknown) => e)) as DomainError;
      expect(err.code).toBe('ALREADY_CAPTURED');
      expect(err.paypalDebugId).toMatch(/^dbg-/);
      expect(await orderState(s.orderId)).toBe('DELIVERED');
    });

    it('a final 4xx moves the order to FAILED and audits CAPTURE_FAILED with the PayPal debug id', async () => {
      const s = await delivered();
      h.pp.failures.push({
        match: /POST \/v2\/payments\/authorizations\/.+\/capture$/,
        count: 1,
        status: 422,
        body: { name: 'UNPROCESSABLE_ENTITY', message: 'x', details: [{ issue: 'CAPTURE_AMOUNT_EXCEEDS_AUTHORIZED' }] },
      });
      expect(await code(capture(h.ctx, s.orderId))).toBe('PAYPAL_ERROR');
      expect(await orderState(s.orderId)).toBe('FAILED');
      const ev = (await h.t.db.query<{ paypal_debug_id: string | null }>(`select paypal_debug_id from audit_event where entity_id = $1 and type = 'CAPTURE_FAILED'`, [s.orderId])).rows;
      expect(ev).toHaveLength(1);
      expect(ev[0]!.paypal_debug_id).toMatch(/^dbg-/);
      expect(posts('/capture')).toHaveLength(1); // final: not retried
      expect(h.sleeps).toEqual([]);
    });

    it('does not mark SETTLED when PayPal answers PENDING', async () => {
      const s = await delivered();
      h.pp.captureStatus = 'PENDING';
      expect(await code(capture(h.ctx, s.orderId))).toBe('PAYPAL_ERROR');
      const row = (await getOrder(h.t.db, s.orderId))!;
      expect(row.state).toBe('DELIVERED');
      expect(row.captureId).toBeNull();
      expect(await auditTypes(s.orderId)).toContain('CAPTURE_NOT_COMPLETED');
    });

    it('is blocked by the kill switch before any capture is sent', async () => {
      const s = await delivered();
      h.writes.enabled = false;
      expect(await code(capture(h.ctx, s.orderId))).toBe('WRITES_DISABLED');
      expect(posts('/capture')).toHaveLength(0);
      expect(await orderState(s.orderId)).toBe('DELIVERED');
    });
  });
});

describe('voidHold', () => {
  it('voids a HELD authorization at PayPal and records the human confirmation', async () => {
    const s = await held();
    const r = await voidHold(h.ctx, s.orderId, { reason: 'SLA_BREACH', confirmedBy: 'owner@acme.test' });
    expect(r.reused).toBe(false);
    expect(posts('/void')[0]!.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'void', 1));
    expect(h.pp.auths.get(s.authorizationId)!.status).toBe('VOIDED');
    expect(await orderState(s.orderId)).toBe('VOIDED');
    const ev = (await h.t.db.query<{ actor: string; payload: Record<string, string> }>(`select actor, payload from audit_event where entity_id = $1 and type = 'HOLD_VOIDED'`, [s.orderId])).rows[0]!;
    expect(ev.actor).toBe('user:owner@acme.test');
    expect(ev.payload).toMatchObject({ reason: 'SLA_BREACH', previousState: 'HELD', amountMinor: '14040' });
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('voids an IN_TRANSIT order too', async () => {
    const s = await held();
    await advance(s.orderId, 'HELD', 'IN_TRANSIT');
    await voidHold(h.ctx, s.orderId, { reason: 'SLA_BREACH' });
    expect(await orderState(s.orderId)).toBe('VOIDED');
  });

  it('is idempotent: a second void is a no-op with no network traffic', async () => {
    const s = await held();
    await voidHold(h.ctx, s.orderId, { reason: 'CANCEL' });
    h.pp.seen.length = 0;
    expect(await voidHold(h.ctx, s.orderId, { reason: 'CANCEL' })).toEqual({ reused: true });
    expect(h.pp.seen).toHaveLength(0);
  });

  it('converges when PayPal already voided the authorization (a lost response)', async () => {
    const s = await held();
    h.pp.auths.get(s.authorizationId)!.status = 'VOIDED';
    const r = await voidHold(h.ctx, s.orderId, { reason: 'SLA_BREACH' });
    expect(r.reused).toBe(false);
    expect(await orderState(s.orderId)).toBe('VOIDED');
    expect(await auditTypes(s.orderId)).toContain('HOLD_VOIDED');
  });

  it('refuses ALREADY_CAPTURED when PayPal captured it, and leaves the order HELD', async () => {
    const s = await held();
    h.pp.auths.get(s.authorizationId)!.status = 'CAPTURED';
    expect(await code(voidHold(h.ctx, s.orderId, { reason: 'SLA_BREACH' }))).toBe('ALREADY_CAPTURED');
    expect(await orderState(s.orderId)).toBe('HELD');
  });

  it('refuses a settled order (refund, not void) without calling PayPal', async () => {
    const s = await delivered();
    await capture(h.ctx, s.orderId);
    h.pp.seen.length = 0;
    expect(await code(voidHold(h.ctx, s.orderId, { reason: 'CANCEL' }))).toBe('ALREADY_CAPTURED');
    expect(h.pp.seen).toHaveLength(0);
  });

  it('refuses states that hold no authorization', async () => {
    const s = await seedGatedOrder(h.t);
    expect(await code(voidHold(h.ctx, s.orderId, { reason: 'CANCEL' }))).toBe('BAD_STATE');
    const d = await delivered();
    expect(await code(voidHold(h.ctx, d.orderId, { reason: 'CANCEL' }))).toBe('BAD_STATE');
  });

  it('is blocked by the kill switch', async () => {
    const s = await held();
    h.writes.enabled = false;
    expect(await code(voidHold(h.ctx, s.orderId, { reason: 'CANCEL' }))).toBe('WRITES_DISABLED');
    expect(await orderState(s.orderId)).toBe('HELD');
    expect(h.pp.auths.get(s.authorizationId)!.status).toBe('CREATED');
  });
});

describe('reauthDue', () => {
  const now = new Date('2036-01-10T12:00:00Z');
  const at = (ms: number) => new Date(now.getTime() + ms);
  // The honor period ended a little more than the safety margin ago: PayPal accepts a reauthorization now.
  const base = { state: 'HELD', honorEndsAt: at(-REAUTH_AFTER_HONOR_MS - 1000), authExpiresAt: at(10 * 86_400_000) };

  it('is due once the honor period has ended (plus the skew margin), which is when PayPal accepts it', () => {
    expect(reauthDue(base, now)).toBe(true);
    expect(reauthDue({ ...base, state: 'IN_TRANSIT' }, now)).toBe(true);
  });
  it('is never due inside the honor period, where PayPal refuses a reauthorization', () => {
    expect(reauthDue({ ...base, honorEndsAt: at(2 * 3_600_000) }, now)).toBe(false); // the old "2 h before the end" window
    expect(reauthDue({ ...base, honorEndsAt: at(1000) }, now)).toBe(false);
  });
  it('waits out the skew margin just after the honor period ends', () => {
    expect(reauthDue({ ...base, honorEndsAt: at(-REAUTH_AFTER_HONOR_MS + 1000) }, now)).toBe(false);
  });
  it('is never due past the authorization expiry', () => {
    expect(reauthDue({ ...base, authExpiresAt: at(-1) }, now)).toBe(false);
  });
  it('is not due outside HELD/IN_TRANSIT or without hold facts', () => {
    for (const state of ['AWAITING_APPROVAL', 'DELIVERED', 'SETTLED', 'VOIDED']) expect(reauthDue({ ...base, state }, now)).toBe(false);
    expect(reauthDue({ ...base, honorEndsAt: null }, now)).toBe(false);
    expect(reauthDue({ ...base, authExpiresAt: null }, now)).toBe(false);
  });
  it('is never due once the hold has been reauthorized (PayPal allows one reauthorization)', () => {
    expect(reauthDue({ ...base, authorizationHistory: ['AUTH-1'] }, now)).toBe(true);
    expect(reauthDue({ ...base, authorizationHistory: ['AUTH-1', 'AUTH-2'] }, now)).toBe(false);
  });
});

describe('reauthorize', () => {
  it('replaces the authorization, keeps the state, and keeps the superseded id in history', async () => {
    const s = await held();
    const r = await reauthorize(h.ctx, s.orderId, 2);
    expect(r.authorizationId).not.toBe(s.authorizationId);
    expect(posts('/reauthorize')[0]!.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'reauthorize', 2));

    const row = (await getOrder(h.t.db, s.orderId))!;
    expect(row.state).toBe('HELD');
    expect(row.authorizationId).toBe(r.authorizationId);
    expect(row.authorizationHistory).toEqual([s.authorizationId, r.authorizationId]);
    const fresh = h.pp.auths.get(r.authorizationId)!;
    expect(row.honorEndsAt!.getTime()).toBe(new Date(fresh.create_time).getTime() + 3 * 86_400_000);
    expect(row.authExpiresAt!.toISOString()).toBe(new Date(fresh.expiration_time).toISOString());
    expect(await auditTypes(s.orderId)).toContain('HOLD_REAUTHORIZED');
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('is idempotent per attempt: repeating attempt 2 sends nothing', async () => {
    const s = await held();
    const a = await reauthorize(h.ctx, s.orderId, 2);
    h.pp.seen.length = 0;
    const b = await reauthorize(h.ctx, s.orderId, 2);
    expect(b).toEqual(a);
    expect(h.pp.seen).toHaveLength(0);
  });

  it('refuses a second reauthorization (PayPal allows one) without calling PayPal', async () => {
    const s = await held();
    await reauthorize(h.ctx, s.orderId, 2);
    h.pp.seen.length = 0;
    expect(await code(reauthorize(h.ctx, s.orderId, 3))).toBe('BAD_STATE');
    expect(h.pp.seen).toHaveLength(0);
  });

  it('a later capture targets the NEW authorization with a NEW request id', async () => {
    const s = await held();
    await advance(s.orderId, 'HELD', 'IN_TRANSIT');
    const r = await reauthorize(h.ctx, s.orderId, 2);
    await advance(s.orderId, 'IN_TRANSIT', 'DELIVERED');
    await seedFulfillment(h.t, s.orderId);
    h.pp.seen.length = 0;
    await capture(h.ctx, s.orderId);
    const call = posts('/capture')[0]!;
    expect(call.path).toBe(`/v2/payments/authorizations/${r.authorizationId}/capture`);
    expect(call.headers['paypal-request-id']).toBe(paypalRequestId(s.orderId, 'capture', 2));
  });

  it('rejects attempt numbers below 2', async () => {
    const s = await held();
    expect(await code(reauthorize(h.ctx, s.orderId, 1))).toBe('VALIDATION');
    expect(await code(reauthorize(h.ctx, s.orderId, 2.5))).toBe('VALIDATION');
  });

  it('refuses an authorization that has already expired, and orders not on hold', async () => {
    const s = await held();
    await h.t.db.query(`update purchase_order set auth_expires_at = now() - interval '1 minute' where id = $1`, [s.orderId]);
    expect(await code(reauthorize(h.ctx, s.orderId, 2))).toBe('BAD_STATE');
    const g = await seedGatedOrder(h.t);
    expect(await code(reauthorize(h.ctx, g.orderId, 2))).toBe('BAD_STATE');
    expect(posts('/reauthorize')).toHaveLength(0);
  });

  it('is blocked by the kill switch', async () => {
    const s = await held();
    h.writes.enabled = false;
    expect(await code(reauthorize(h.ctx, s.orderId, 2))).toBe('WRITES_DISABLED');
    expect((await getOrder(h.t.db, s.orderId))!.authorizationId).toBe(s.authorizationId);
  });
});

describe('pushTracking', () => {
  it('refuses a carrier PayPal does not know, before any network call', async () => {
    const s = await delivered();
    expect(await code(pushTracking(h.ctx, s.orderId, s.paypalOrderId, { captureId: 'CAP-1', carrier: "Bob's Couriers", trackingNumber: '1Z' }))).toBe('CARRIER_UNKNOWN');
    expect(h.pp.seen).toHaveLength(0);
  });

  it('refuses an empty tracking number', async () => {
    const s = await delivered();
    expect(await code(pushTracking(h.ctx, s.orderId, s.paypalOrderId, { captureId: 'CAP-1', carrier: 'UPS', trackingNumber: '  ' }))).toBe('VALIDATION');
  });

  it('pushes carrier and tracking for the real capture id after settlement', async () => {
    const s = await delivered({}, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });
    const { captureId } = await capture(h.ctx, s.orderId);
    await pushTracking(h.ctx, s.orderId, s.paypalOrderId, { captureId, carrier: 'UPS', trackingNumber: '1Z999AA10123456784', items: [{ name: 'USB-C cable 2m', quantity: 10, sku: 'sku-1' }] });
    const tracked = h.pp.orders.get(s.paypalOrderId)!.tracking;
    expect(tracked).toHaveLength(1);
    expect(tracked[0]).toMatchObject({ capture_id: captureId, carrier: 'UPS', tracking_number: '1Z999AA10123456784', notify_payer: false });
    expect(tracked[0].items[0]).toMatchObject({ name: 'USB-C cable 2m', quantity: '10', sku: 'sku-1' });
  });

  it('PayPal rejects tracking for a capture id that does not belong to the order', async () => {
    const s = await delivered();
    await capture(h.ctx, s.orderId);
    const err = (await pushTracking(h.ctx, s.orderId, s.paypalOrderId, { captureId: 'CAP-NOPE', carrier: 'UPS', trackingNumber: '1Z' }).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('PAYPAL_ERROR');
  });
});
