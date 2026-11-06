import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getDispute, getOrder, getWebhookEvent, markWebhookVerified, recordWebhookEvent, transition, verifyChain, withTx } from '@aegis/db';
import type { WebhookVerification } from '@aegis/db';
import { capture, reauthorize } from '../src/authorizations.ts';
import { authorizeHold, createHold } from '../src/orders.ts';
import { refundCapture } from '../src/refunds.ts';
import { processWebhookEvent } from '../src/webhooks/process.ts';
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
  h.pp.refundStatus = 'COMPLETED';
  h.pp.delayMs = 0;
  h.sleeps.length = 0;
  h.writes.enabled = true;
  h.clock.offsetMs = 0;
});

const APP = 'https://aegispay.example';
let seq = 0;

const orderOf = async (id: string) => (await getOrder(h.t.db, id))!;
const auditCount = async (orderId: string, type: string) =>
  Number((await h.t.db.query<{ n: string }>(`select count(*) n from audit_event where entity_id = $1 and type = $2`, [orderId, type])).rows[0]!.n);
const auditCountAll = async (type: string) =>
  Number((await h.t.db.query<{ n: string }>(`select count(*) n from audit_event where type = $1`, [type])).rows[0]!.n);

/** Record a delivery the way the API does, then mark it verified the way the worker does. */
async function deliver(type: string, resource: object, verified: WebhookVerification | null = 'POSTBACK') {
  const id = `WH-P-${++seq}-${randomUUID()}`;
  const raw = Buffer.from(JSON.stringify({ id, event_type: type, resource }), 'utf8');
  await recordWebhookEvent(h.t.db, { eventId: id, eventType: type, rawBody: raw, headers: {} });
  if (verified) await markWebhookVerified(h.t.db, id, verified, verified === 'FAILED' ? 'bad signature' : undefined);
  return (await getWebhookEvent(h.t.db, id))!;
}
const run = async (type: string, resource: object) => processWebhookEvent(h.ctx, await deliver(type, resource));

/** AWAITING_APPROVAL with a PayPal order that exists; the buyer has not approved yet. */
async function awaiting(opts: SeedOptions = {}) {
  const s = await seedGatedOrder(h.t, opts);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'USB-C cables' }, appUrl: APP });
  return { ...s, paypalOrderId };
}
async function held(opts: SeedOptions = {}) {
  const s = await awaiting(opts);
  h.pp.approve(s.paypalOrderId);
  const a = await authorizeHold(h.ctx, s.orderId, s.paypalOrderId, { approvedBy: 'owner@acme.test' });
  return { ...s, authorizationId: a.authorizationId };
}
const advance = (orderId: string, from: 'HELD' | 'IN_TRANSIT', to: 'IN_TRANSIT' | 'DELIVERED') => withTx((tx) => transition(tx, orderId, [from], to), h.t.db);
async function delivered(opts: SeedOptions = {}) {
  const s = await held(opts);
  await advance(s.orderId, 'HELD', 'IN_TRANSIT');
  await advance(s.orderId, 'IN_TRANSIT', 'DELIVERED');
  await seedFulfillment(h.t, s.orderId);
  return s;
}
async function settled() {
  const s = await delivered();
  const c = await capture(h.ctx, s.orderId);
  return { ...s, captureId: c.captureId };
}

/** PayPal captured the authorization and our database has not heard about it yet. */
function capturedAtPayPal(authorizationId: string, o: { value?: string; status?: string } = {}) {
  const id = `CAP-EXT-${++seq}`;
  h.pp.captures.set(id, {
    id,
    amount: { currency_code: 'USD', value: o.value ?? '140.40' },
    refundedMinor: 0,
    refundIds: [],
    ...(o.status ? { status: o.status } : {}),
  });
  h.pp.auths.get(authorizationId)!.status = 'CAPTURED';
  return id;
}
const captureResource = (id: string, s: { authorizationId: string; paypalOrderId: string }) => ({
  id,
  supplementary_data: { related_ids: { authorization_id: s.authorizationId, order_id: s.paypalOrderId } },
});
const upLink = (captureId: string) => [{ rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }];

describe('a webhook is a hint: only verified events are acted on', () => {
  it.each([['not yet verified', null], ['FAILED', 'FAILED']] as const)('refuses an event that is %s and changes nothing', async (_n, v) => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId);
    const ev = await deliver('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s), v);
    const err = await processWebhookEvent(h.ctx, ev).catch((e: unknown) => e);
    expect((err as DomainError).code).toBe('INTERNAL');
    expect((await orderOf(s.orderId)).state).toBe('DELIVERED');
  });

  it('ignores a body that is not a PayPal event, and an event type it does not act on', async () => {
    const id = `WH-P-${++seq}-${randomUUID()}`;
    await recordWebhookEvent(h.t.db, { eventId: id, eventType: 'X', rawBody: Buffer.from('not json'), headers: {} });
    await markWebhookVerified(h.t.db, id, 'POSTBACK');
    const junk = await processWebhookEvent(h.ctx, (await getWebhookEvent(h.t.db, id))!);
    expect(junk).toMatchObject({ action: 'IGNORED', detail: 'body is not a PayPal event' });
    expect(await run('BILLING.SUBSCRIPTION.CREATED', { id: 'I-1' })).toMatchObject({ action: 'IGNORED' });
  });

  it('records an event that names nothing of ours as UNLINKED and does nothing else', async () => {
    const before = await auditCountAll('WEBHOOK_UNLINKED');
    const out = await run('PAYMENT.CAPTURE.COMPLETED', { id: 'CAP-NOT-OURS' });
    expect(out).toMatchObject({ action: 'UNLINKED', orderId: null });
    expect(await auditCountAll('WEBHOOK_UNLINKED')).toBe(before + 1);
  });
});

describe('PAYMENT.CAPTURE.COMPLETED', () => {
  it('settles a DELIVERED order whose capture PayPal made first, with one CAPTURED row and a tracking follow-up', async () => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId);
    h.pp.seen.length = 0;

    const out = await run('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s));
    expect(out).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect(out.followUps).toEqual([{ job: 'tracking.push', orderId: s.orderId, captureId: capId }]);
    // it re-read PayPal before acting
    expect(h.pp.seen.some((c) => c.method === 'GET' && c.path === `/v2/payments/captures/${capId}`)).toBe(true);

    const row = await orderOf(s.orderId);
    expect(row).toMatchObject({ state: 'SETTLED', captureId: capId });
    expect(await auditCount(s.orderId, 'CAPTURED')).toBe(1);
    const payload = (await h.t.db.query<{ payload: Record<string, unknown> }>(`select payload from audit_event where entity_id = $1 and type = 'CAPTURED'`, [s.orderId])).rows[0]!.payload;
    expect(payload).toMatchObject({ source: 'WEBHOOK', captureId: capId, amountMinor: '14040' });
  });

  it('is idempotent: a replay changes nothing, and capture() afterwards reuses the stored capture without a second PayPal call', async () => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId);
    await run('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s));
    const replay = await run('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s));
    expect(replay.action).toBe('NOOP');
    expect(await auditCount(s.orderId, 'CAPTURED')).toBe(1);

    h.pp.seen.length = 0;
    expect(await capture(h.ctx, s.orderId)).toMatchObject({ captureId: capId, reused: true });
    expect(h.pp.seen.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('racing capture() against its own webhook leaves exactly one SETTLED order and one CAPTURED row', async () => {
    const s = await delivered();
    h.pp.delayMs = 40;
    const known = new Set(h.pp.captures.keys());
    const pending = capture(h.ctx, s.orderId);
    let capId: string | undefined;
    for (let i = 0; i < 400 && !capId; i++) {
      capId = [...h.pp.captures.keys()].find((k) => !known.has(k));
      if (!capId) await new Promise((r) => setTimeout(r, 5));
    }
    expect(capId).toBeDefined();
    const ev = await deliver('PAYMENT.CAPTURE.COMPLETED', captureResource(capId!, s));
    const [c, w] = await Promise.all([pending, processWebhookEvent(h.ctx, ev)]);

    expect(c.captureId).toBe(capId);
    expect(['APPLIED', 'NOOP']).toContain(w.action);
    expect(await orderOf(s.orderId)).toMatchObject({ state: 'SETTLED', captureId: capId });
    expect(await auditCount(s.orderId, 'CAPTURED')).toBe(1);
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('does not settle when PayPal captured a different amount than the gated order', async () => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId, { value: '1.00' });
    const out = await run('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s));
    expect(out.action).toBe('ALERT');
    expect((await orderOf(s.orderId)).state).toBe('DELIVERED');
    expect(await auditCount(s.orderId, 'WEBHOOK_STATE_MISMATCH')).toBe(1);
  });

  it('raises a mismatch, and moves nothing, when PayPal captured an order that never reached DELIVERED', async () => {
    const s = await held();
    const capId = capturedAtPayPal(s.authorizationId);
    const out = await run('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s));
    expect(out.action).toBe('ALERT');
    expect(out.detail).toMatch(/order is HELD, not DELIVERED/);
    expect((await orderOf(s.orderId)).state).toBe('HELD');
  });

  it('trusts PayPal over the event: a capture PayPal does not report as COMPLETED changes nothing', async () => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId, { status: 'PENDING' });
    expect(await run('PAYMENT.CAPTURE.COMPLETED', captureResource(capId, s))).toMatchObject({ action: 'NOOP' });
    expect((await orderOf(s.orderId)).state).toBe('DELIVERED');
  });
});

describe('PAYMENT.CAPTURE.DENIED', () => {
  it('fails a DELIVERED order whose capture PayPal refused, once', async () => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId, { status: 'DECLINED' });
    expect(await run('PAYMENT.CAPTURE.DENIED', captureResource(capId, s))).toMatchObject({ action: 'APPLIED' });
    expect((await orderOf(s.orderId)).state).toBe('FAILED');
    expect(await run('PAYMENT.CAPTURE.DENIED', captureResource(capId, s))).toMatchObject({ action: 'NOOP' });
    expect(await auditCount(s.orderId, 'CAPTURE_FAILED')).toBe(1);
  });

  it('does not fail the order when PayPal says the capture is fine', async () => {
    const s = await delivered();
    const capId = capturedAtPayPal(s.authorizationId);
    expect(await run('PAYMENT.CAPTURE.DENIED', captureResource(capId, s))).toMatchObject({ action: 'NOOP' });
    expect((await orderOf(s.orderId)).state).toBe('DELIVERED');
  });
});

describe('PAYMENT.AUTHORIZATION.VOIDED', () => {
  it('records a void PayPal made, once', async () => {
    const s = await held();
    h.pp.auths.get(s.authorizationId)!.status = 'VOIDED';
    expect(await run('PAYMENT.AUTHORIZATION.VOIDED', { id: s.authorizationId })).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('VOIDED');
    expect(await run('PAYMENT.AUTHORIZATION.VOIDED', { id: s.authorizationId })).toMatchObject({ action: 'NOOP' });
    expect(await auditCount(s.orderId, 'HOLD_VOIDED_AT_PAYPAL')).toBe(1);
  });

  it('ignores the VOIDED event for an authorization our own reauthorization superseded', async () => {
    const s = await held();
    await reauthorize(h.ctx, s.orderId, 2);
    expect(h.pp.auths.get(s.authorizationId)!.status).toBe('VOIDED'); // PayPal voided the old id, as it does
    const out = await run('PAYMENT.AUTHORIZATION.VOIDED', { id: s.authorizationId });
    expect(out).toMatchObject({ action: 'NOOP', orderId: s.orderId });
    expect(out.detail).toMatch(/superseded/);
    expect((await orderOf(s.orderId)).state).toBe('HELD');
  });

  it('does nothing when PayPal still reports the authorization as usable', async () => {
    const s = await held();
    expect(await run('PAYMENT.AUTHORIZATION.VOIDED', { id: s.authorizationId })).toMatchObject({ action: 'NOOP' });
    expect((await orderOf(s.orderId)).state).toBe('HELD');
  });
});

describe('CHECKOUT.ORDER.APPROVED and PAYMENT.AUTHORIZATION.CREATED (backstop for a lost onApprove)', () => {
  it('authorizes the hold once the buyer has approved at PayPal', async () => {
    const s = await awaiting();
    h.pp.approve(s.paypalOrderId);
    expect(await run('CHECKOUT.ORDER.APPROVED', { id: s.paypalOrderId })).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('HELD');
    expect(await run('CHECKOUT.ORDER.APPROVED', { id: s.paypalOrderId })).toMatchObject({ action: 'NOOP' });
  });

  it('takes PayPal over the event: an order the buyer has not approved stays AWAITING_APPROVAL', async () => {
    const s = await awaiting();
    const out = await run('CHECKOUT.ORDER.APPROVED', { id: s.paypalOrderId });
    expect(out).toMatchObject({ action: 'NOOP', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('AWAITING_APPROVAL');
  });

  it('finds the order from the related PayPal order id on an authorization event', async () => {
    const s = await awaiting();
    h.pp.approve(s.paypalOrderId);
    const out = await run('PAYMENT.AUTHORIZATION.CREATED', { id: 'AUTH-NOT-YET-KNOWN', supplementary_data: { related_ids: { order_id: s.paypalOrderId } } });
    expect(out).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('HELD');
  });

  it('is an authorization, so the kill switch applies: the event is not processed while writes are off', async () => {
    const s = await awaiting();
    h.pp.approve(s.paypalOrderId);
    h.writes.enabled = false;
    const err = await run('CHECKOUT.ORDER.APPROVED', { id: s.paypalOrderId }).catch((e: unknown) => e);
    expect((err as DomainError).code).toBe('WRITES_DISABLED');
    expect((await orderOf(s.orderId)).state).toBe('AWAITING_APPROVAL');
  });
});

describe('PAYMENT.CAPTURE.REFUNDED', () => {
  it('moves a SETTLED order to REFUNDED when PayPal reports the whole capture refunded (a refund made outside our system)', async () => {
    const s = await settled();
    h.pp.captures.get(s.captureId)!.refundedMinor = 14040;
    const out = await run('PAYMENT.CAPTURE.REFUNDED', { id: 'REF-EXT-1', links: upLink(s.captureId) });
    expect(out).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('REFUNDED');
    expect(await auditCount(s.orderId, 'REFUND_OBSERVED')).toBe(1);
    expect(await run('PAYMENT.CAPTURE.REFUNDED', { id: 'REF-EXT-1', links: upLink(s.captureId) })).toMatchObject({ action: 'NOOP' });
  });

  it('leaves the order SETTLED after a partial refund', async () => {
    const s = await settled();
    h.pp.captures.get(s.captureId)!.refundedMinor = 1000;
    const out = await run('PAYMENT.CAPTURE.REFUNDED', { id: 'REF-EXT-2', links: upLink(s.captureId) });
    expect(out.action).toBe('NOOP');
    expect((await orderOf(s.orderId)).state).toBe('SETTLED');
  });

  it('settles a PENDING refund of ours through reconcileRefund when PayPal completes it', async () => {
    const s = await settled();
    h.pp.refundStatus = 'PENDING';
    const r = await refundCapture(h.ctx, s.orderId, { reason: 'wrong colour', confirmedBy: 'owner@acme.test' });
    expect(r.status).toBe('PENDING');
    expect((await orderOf(s.orderId)).state).toBe('SETTLED');

    h.pp.refunds.get(r.refundId)!.status = 'COMPLETED';
    const out = await run('PAYMENT.CAPTURE.REFUNDED', { id: r.refundId, links: upLink(s.captureId) });
    expect(out).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('REFUNDED');
    expect(await auditCount(s.orderId, 'REFUND_STATUS_CHANGED')).toBe(1);
  });

  it('records a refund of a capture we never recorded as UNLINKED and moves nothing', async () => {
    const s = await held();
    const capId = capturedAtPayPal(s.authorizationId);
    h.pp.captures.get(capId)!.refundedMinor = 14040;
    const out = await run('PAYMENT.CAPTURE.REFUNDED', { id: 'REF-EXT-3', links: upLink(capId) });
    expect(out.action).toBe('UNLINKED');
    expect((await orderOf(s.orderId)).state).toBe('HELD');
  });
});

describe('CUSTOMER.DISPUTE.*', () => {
  it('syncs the dispute from PayPal and moves the SETTLED order to DISPUTED, once', async () => {
    const s = await settled();
    const d = h.pp.addDispute({ captureId: s.captureId });
    const out = await run('CUSTOMER.DISPUTE.CREATED', { dispute_id: d.id });
    expect(out).toMatchObject({ action: 'APPLIED', orderId: s.orderId });
    expect((await orderOf(s.orderId)).state).toBe('DISPUTED');
    expect(await getDispute(h.t.db, d.id)).toMatchObject({ orderId: s.orderId });
    expect(await run('CUSTOMER.DISPUTE.UPDATED', { dispute_id: d.id })).toMatchObject({ action: 'NOOP' });
  });
});

describe('the audit chain', () => {
  it('still verifies after everything above', async () => {
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });
});
