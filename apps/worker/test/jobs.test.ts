import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import {
  getDispute,
  getFulfillment,
  getOrder,
  recordWebhookEvent,
  transition,
  verifyChain,
  withTx,
} from '@aegis/db';
import { CertCache, authorizeHold, createHold, syncDispute } from '@aegis/payments';
import type { WebhookFollowUp, WebhookPipeline } from '@aegis/payments';
import { seedFulfillment, seedGatedOrder, startHarness } from '../../../packages/payments/test/harness.ts';
import type { Harness, SeedOptions } from '../../../packages/payments/test/harness.ts';
import { makeCert, signWebhook } from '../../../packages/payments/test/webhook-signing.ts';
import {
  classifyFailure,
  runCapture,
  runPollOpen,
  runReauthSweep,
  runRefundReconcile,
  runSlaWatch,
  runTrackingPush,
  runVoid,
  runWebhookSweep,
} from '../src/jobs.ts';
import type { WorkerDeps } from '../src/jobs.ts';

const WEBHOOK_ID = 'WH-WORKER-1';
const cert = makeCert();
const APP = 'https://aegispay.example';
const DAY = 86_400_000;
/** Offsets that put the app clock on a known calendar day relative to the mandates seeded with 2036 deadlines. */
const ON_2036_12_01 = 3678 * DAY; // from 2026-11-06 (ten years, three leap days, plus 25 days)
const PAST_ALL_2036 = 3700 * DAY;

let h: Harness;
let pipe: WebhookPipeline;
let queued: WebhookFollowUp[];
let deps: WorkerDeps;

beforeAll(async () => {
  h = await startHarness();
  h.pp.webhook = { webhookId: WEBHOOK_ID, certPem: cert.certPem };
  pipe = { ctx: h.ctx, certs: new CertCache(h.clock, async () => cert.certPem), webhookId: WEBHOOK_ID };
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.pp.seen.length = 0;
  h.pp.failures.length = 0;
  h.pp.captureStatus = 'COMPLETED';
  h.sleeps.length = 0;
  h.writes.enabled = true;
  h.clock.offsetMs = 0;
  queued = [];
  deps = { pipeline: pipe, clock: h.clock, enqueue: async (j) => void queued.push(j) };
});

const auditRows = async (orderId: string, type?: string) =>
  (await h.t.db.query<{ type: string; actor: string; payload: any }>(
    `select type, actor, payload from audit_event where entity_id = $1 ${type ? 'and type = $2' : ''} order by seq`,
    type ? [orderId, type] : [orderId],
  )).rows;
const state = async (id: string) => (await getOrder(h.t.db, id))!.state;
const posts = (suffix: string) => h.pp.seen.filter((c) => c.method === 'POST' && c.path.endsWith(suffix));

/** A real hold: gated order → PayPal order → buyer approval → authorization (state HELD). */
async function held(opts: SeedOptions = {}) {
  const s = await seedGatedOrder(h.t, opts);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'USB-C cables' }, appUrl: APP });
  h.pp.approve(paypalOrderId);
  const a = await authorizeHold(h.ctx, s.orderId, paypalOrderId, { approvedBy: 'owner@acme.test' });
  return { ...s, paypalOrderId, authorizationId: a.authorizationId };
}
const advance = (orderId: string, from: 'HELD' | 'IN_TRANSIT', to: 'IN_TRANSIT' | 'DELIVERED') =>
  withTx((tx) => transition(tx, orderId, [from], to), h.t.db);
async function delivered(opts: SeedOptions = {}, f: { carrier?: string; trackingNumber?: string } = {}) {
  const s = await held(opts);
  await advance(s.orderId, 'HELD', 'IN_TRANSIT');
  await advance(s.orderId, 'IN_TRANSIT', 'DELIVERED');
  await seedFulfillment(h.t, s.orderId, f);
  return s;
}
/** A PayPal order the buyer may approve but that we have not authorized (our onApprove was lost). */
async function awaitingApproval() {
  const s = await seedGatedOrder(h.t);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'cables' }, appUrl: APP });
  return { ...s, paypalOrderId };
}

describe('classifyFailure', () => {
  it.each([
    [new DomainError('WRITES_DISABLED', 'off'), 'deferred'],
    [new DomainError('BAD_STATE', 'x'), 'permanent'],
    [new DomainError('PROOF_GATE_FAILED', 'x'), 'permanent'],
    [new DomainError('CARRIER_UNKNOWN', 'x'), 'permanent'],
    [new DomainError('ALREADY_CAPTURED', 'x'), 'permanent'],
    [new DomainError('PAYPAL_ERROR', 'x'), 'retry'],
    [new DomainError('CONCURRENT_UPDATE', 'x'), 'retry'],
    [Object.assign(new Error('bad payload'), { name: 'ZodError' }), 'permanent'],
    [new Error('ECONNRESET'), 'retry'],
    ['not an error', 'retry'],
  ] as const)('%s → %s', (err, expected) => {
    expect(classifyFailure(err)).toBe(expected);
  });
});

describe('runCapture and runTrackingPush', () => {
  it('captures a delivered order, queues the tracking push, and pushes carrier + tracking to PayPal once', async () => {
    const s = await delivered({}, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });
    const cap = await runCapture(deps, s.orderId);
    expect(cap.reused).toBe(false);
    expect(await state(s.orderId)).toBe('SETTLED');
    expect(queued).toEqual([{ job: 'tracking.push', orderId: s.orderId, captureId: cap.captureId }]);

    expect(await runTrackingPush(deps, s.orderId, cap.captureId)).toBe('PUSHED');
    const tracker = h.pp.orders.get(s.paypalOrderId)!.tracking;
    expect(tracker).toHaveLength(1);
    expect(tracker[0]).toMatchObject({ capture_id: cap.captureId, tracking_number: '1Z999AA10123456784', carrier: 'UPS', notify_payer: false });
    expect((await getFulfillment(h.t.db, s.orderId))!.pushedToPaypalAt).toBeInstanceOf(Date);
    const rows = await auditRows(s.orderId, 'TRACKING_PUSHED');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toMatchObject({ captureId: cap.captureId, carrier: 'UPS', fulfillmentSource: 'SIMULATED' });

    // a repeat (queue retry, or a webhook that also queued it) sends nothing more
    expect(await runTrackingPush(deps, s.orderId, cap.captureId)).toBe('ALREADY_PUSHED');
    expect(h.pp.orders.get(s.paypalOrderId)!.tracking).toHaveLength(1);
    expect(await auditRows(s.orderId, 'TRACKING_PUSHED')).toHaveLength(1);
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('refuses to capture an order that is not delivered, writes nothing to PayPal, and classifies it permanent', async () => {
    const s = await held();
    h.pp.seen.length = 0;
    const err = (await runCapture(deps, s.orderId).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('BAD_STATE');
    expect(classifyFailure(err)).toBe('permanent');
    expect(posts('/capture')).toHaveLength(0);
    expect(queued).toEqual([]);
    expect(await state(s.orderId)).toBe('HELD');
  });

  it('does not push tracking for a capture the order does not have (stale job)', async () => {
    const s = await delivered();
    await runCapture(deps, s.orderId);
    expect(await runTrackingPush(deps, s.orderId, 'SOME-OTHER-CAPTURE')).toBe('STALE');
    expect(h.pp.orders.get(s.paypalOrderId)!.tracking).toHaveLength(0);
    expect((await getFulfillment(h.t.db, s.orderId))!.pushedToPaypalAt).toBeNull();
  });

  it('refuses a carrier PayPal does not know and leaves the order unmarked, so it is not silently sent as OTHER', async () => {
    const s = await delivered({}, { carrier: 'MY-OWN-COURIER' });
    const cap = await runCapture(deps, s.orderId);
    const err = (await runTrackingPush(deps, s.orderId, cap.captureId).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('CARRIER_UNKNOWN');
    expect(classifyFailure(err)).toBe('permanent');
    expect(h.pp.orders.get(s.paypalOrderId)!.tracking).toHaveLength(0);
    expect((await getFulfillment(h.t.db, s.orderId))!.pushedToPaypalAt).toBeNull();
  });

  it('reports a missing fulfillment record instead of inventing one', async () => {
    const s = await delivered();
    const cap = await runCapture(deps, s.orderId);
    await h.t.db.query('delete from fulfillment where order_id = $1', [s.orderId]);
    expect(await runTrackingPush(deps, s.orderId, cap.captureId)).toBe('NO_FULFILLMENT');
  });

  it('a capture held back by the kill switch is deferred, sends nothing, and succeeds once writes are back on', async () => {
    const s = await delivered();
    h.writes.enabled = false;
    const err = (await runCapture(deps, s.orderId).catch((e: unknown) => e)) as DomainError;
    expect(classifyFailure(err)).toBe('deferred');
    expect(posts('/capture')).toHaveLength(0);
    expect(await state(s.orderId)).toBe('DELIVERED');
    h.writes.enabled = true;
    expect((await runCapture(deps, s.orderId)).reused).toBe(false);
    expect(await state(s.orderId)).toBe('SETTLED');
  });
});

describe('runVoid', () => {
  it('voids a held authorization at PayPal and records who confirmed it', async () => {
    const s = await held();
    expect(await runVoid(deps, s.orderId, { reason: 'SLA_BREACH', confirmedBy: 'owner@acme.test' })).toEqual({ reused: false });
    expect(await state(s.orderId)).toBe('VOIDED');
    expect(h.pp.auths.get(s.authorizationId)!.status).toBe('VOIDED');
    const row = (await auditRows(s.orderId, 'HOLD_VOIDED'))[0]!;
    expect(row.actor).toBe('user:owner@acme.test');
    expect(row.payload).toMatchObject({ reason: 'SLA_BREACH' });
    // running it again is a no-op
    expect(await runVoid(deps, s.orderId, { reason: 'SLA_BREACH', confirmedBy: 'owner@acme.test' })).toEqual({ reused: true });
  });
});

describe('runSlaWatch', () => {
  it('flags only the hold whose deadline has passed, exactly once, and does not void it', async () => {
    const late = await held({ deliverBy: '2036-11-25' });
    const ontime = await held({ deliverBy: '2036-12-31' });
    h.clock.offsetMs = ON_2036_12_01; // the app clock moves (Judge Mode); PayPal's does not
    const first = await runSlaWatch(deps);
    expect(first).toContain(late.orderId);
    expect(first).not.toContain(ontime.orderId);

    expect(await runSlaWatch(deps)).toEqual([]); // a second run flags nothing new
    expect(await auditRows(late.orderId, 'SLA_BREACH_FLAGGED')).toHaveLength(1);
    expect(await auditRows(ontime.orderId, 'SLA_BREACH_FLAGGED')).toHaveLength(0);
    expect(await state(late.orderId)).toBe('HELD'); // flagged, never voided without a human
    expect(h.pp.auths.get(late.authorizationId)!.status).not.toBe('VOIDED');
  });

  it('does not flag an order before its deadline, nor one that is already delivered', async () => {
    const early = await held({ deliverBy: '2036-11-25' });
    const done = await delivered({ deliverBy: '2036-11-25' });
    expect(await runSlaWatch(deps)).toEqual([]);
    h.clock.offsetMs = PAST_ALL_2036;
    const flagged = await runSlaWatch(deps);
    expect(flagged).toContain(early.orderId);
    expect(flagged).not.toContain(done.orderId); // only open holds breach; DELIVERED is past the question
  });

  it('two overlapping runs flag an order once, not twice', async () => {
    const s = await held({ deliverBy: '2036-11-25' });
    h.clock.offsetMs = PAST_ALL_2036;
    const [a, b] = await Promise.all([runSlaWatch(deps), runSlaWatch(deps)]);
    expect([...a, ...b].filter((id) => id === s.orderId)).toHaveLength(1);
    expect(await auditRows(s.orderId, 'SLA_BREACH_FLAGGED')).toHaveLength(1);
  });

  it('the flag carries the facts the dashboard needs to ask for the void', async () => {
    const s = await held({ deliverBy: '2036-11-25' });
    h.clock.offsetMs = PAST_ALL_2036;
    await runSlaWatch(deps);
    const row = (await auditRows(s.orderId, 'SLA_BREACH_FLAGGED'))[0]!;
    expect(row.actor).toBe('system:sla-watch');
    expect(row.payload).toMatchObject({ deliverBy: '2036-11-25', state: 'HELD', amountMinor: s.total.toString(), authorizationId: s.authorizationId });
  });
});

describe('runReauthSweep', () => {
  it('leaves a fresh hold alone, then reauthorizes it once its honor period is about to end', async () => {
    const s = await held();
    expect((await runReauthSweep(deps)).reauthorized).not.toContain(s.orderId);
    expect(h.pp.seen.filter((c) => c.path.endsWith('/reauthorize'))).toHaveLength(0);

    h.clock.offsetMs = 2.95 * DAY; // inside the 2 h lead of the 3-day honor period; the 29-day authorization is still valid
    const r = await runReauthSweep(deps);
    expect(r.reauthorized).toContain(s.orderId);
    expect(r.errors).toEqual([]);
    const row = (await getOrder(h.t.db, s.orderId))!;
    expect(row.authorizationHistory).toHaveLength(2);
    expect(row.authorizationId).not.toBe(s.authorizationId);
  });
});

describe('runRefundReconcile', () => {
  it('has nothing to do when no refund is pending', async () => {
    expect(await runRefundReconcile(deps)).toEqual({ changed: [], errors: [] });
  });
});

describe('runPollOpen', () => {
  it('records an authorization PayPal voided behind our back, once', async () => {
    const s = await held();
    h.pp.auths.get(s.authorizationId)!.status = 'VOIDED';
    const r = await runPollOpen(deps);
    expect(r.applied).toContain(s.orderId);
    expect(await state(s.orderId)).toBe('VOIDED');
    const row = (await auditRows(s.orderId, 'HOLD_VOIDED_AT_PAYPAL'))[0]!;
    expect(row.actor).toBe('system:poller');
    expect((await runPollOpen(deps)).applied).not.toContain(s.orderId);
    expect(await auditRows(s.orderId, 'HOLD_VOIDED_AT_PAYPAL')).toHaveLength(1);
  });

  it('alerts once when PayPal captured the authorization outside our flow, and moves nothing', async () => {
    const s = await held();
    h.pp.auths.get(s.authorizationId)!.status = 'CAPTURED';
    const first = await runPollOpen(deps);
    expect(first.alerts).toContainEqual({ orderId: s.orderId, kind: 'POLL_AUTHORIZATION_CAPTURED' });
    expect(await state(s.orderId)).toBe('HELD');
    const second = await runPollOpen(deps);
    expect(second.alerts.filter((a) => a.orderId === s.orderId)).toEqual([]);
    expect(await auditRows(s.orderId, 'POLL_AUTHORIZATION_CAPTURED')).toHaveLength(1);
  });

  it('authorizes a hold whose approval we never heard about, but only once PayPal says it is approved', async () => {
    const approved = await awaitingApproval();
    const notApproved = await awaitingApproval();
    h.pp.approve(approved.paypalOrderId);
    h.pp.seen.length = 0;
    h.clock.offsetMs = 10 * 60_000; // past the grace period that leaves a fresh approval to the approve route

    const r = await runPollOpen(deps);
    expect(r.applied).toContain(approved.orderId);
    expect(await state(approved.orderId)).toBe('HELD');
    expect(await state(notApproved.orderId)).toBe('AWAITING_APPROVAL');
    // exactly one authorize POST: the unapproved order was read, not poked
    expect(posts('/authorize')).toHaveLength(1);
    expect(posts('/authorize')[0]!.path).toContain(approved.paypalOrderId);
  });

  it('leaves a fresh approval to the approve route (inside the grace period)', async () => {
    const s = await awaitingApproval();
    h.pp.approve(s.paypalOrderId);
    h.pp.seen.length = 0;
    const r = await runPollOpen(deps);
    expect(r.applied).not.toContain(s.orderId);
    expect(await state(s.orderId)).toBe('AWAITING_APPROVAL');
    expect(h.pp.seen.filter((c) => c.path.includes(s.paypalOrderId))).toEqual([]);
  });

  it('re-fetches an open dispute and records what PayPal now says', async () => {
    const s = await delivered();
    const cap = await runCapture(deps, s.orderId);
    const d = h.pp.addDispute({ captureId: cap.captureId });
    await syncDispute(h.ctx, d.id);
    expect(await state(s.orderId)).toBe('DISPUTED');
    expect((await getDispute(h.t.db, d.id))!.status).toBe('WAITING_FOR_SELLER_RESPONSE');

    d.status = 'UNDER_REVIEW'; // PayPal moved it; the webhook was lost
    await runPollOpen(deps);
    expect((await getDispute(h.t.db, d.id))!.status).toBe('UNDER_REVIEW');
  });

  it('one order that fails to read does not stop the rest of the pass', async () => {
    const bad = await held();
    const good = await held();
    h.pp.failures.push({ match: new RegExp(`GET /v2/payments/authorizations/${bad.authorizationId}$`), count: 50, status: 400 });
    h.pp.auths.get(good.authorizationId)!.status = 'VOIDED';
    const r = await runPollOpen(deps);
    expect(r.errors.map((e) => e.ref)).toContain(bad.orderId);
    expect(r.applied).toContain(good.orderId);
    expect(await state(good.orderId)).toBe('VOIDED');
    expect(await state(bad.orderId)).toBe('HELD');
  });
});

describe('runWebhookSweep', () => {
  const receiveSigned = async (type: string, resource: object) => {
    const id = `WH-W-${randomUUID()}`;
    const raw = Buffer.from(JSON.stringify({ id, event_type: type, resource }), 'utf8');
    await recordWebhookEvent(h.t.db, { eventId: id, eventType: type, rawBody: raw, headers: signWebhook(raw, cert, { webhookId: WEBHOOK_ID }) });
    return { id, raw };
  };

  it('verifies a signed capture delivery, settles the order, and queues the tracking push', async () => {
    const s = await held();
    await advance(s.orderId, 'HELD', 'IN_TRANSIT');
    await advance(s.orderId, 'IN_TRANSIT', 'DELIVERED');
    await seedFulfillment(h.t, s.orderId);
    h.pp.captures.set('CAP-SWEEP', { id: 'CAP-SWEEP', amount: { currency_code: 'USD', value: '140.40' }, refundedMinor: 0, refundIds: [] });
    h.pp.orders.get(s.paypalOrderId)!.captureIds.push('CAP-SWEEP'); // the capture belongs to this PayPal order, as at PayPal
    h.pp.auths.get(s.authorizationId)!.status = 'CAPTURED';
    await receiveSigned('PAYMENT.CAPTURE.COMPLETED', {
      id: 'CAP-SWEEP',
      supplementary_data: { related_ids: { authorization_id: s.authorizationId, order_id: s.paypalOrderId } },
    });

    const r = await runWebhookSweep(deps);
    expect(r).toMatchObject({ verified: 1, rejected: 0, processed: 1, followUps: 1 });
    expect(await getOrder(h.t.db, s.orderId)).toMatchObject({ state: 'SETTLED', captureId: 'CAP-SWEEP' });
    expect(queued).toEqual([{ job: 'tracking.push', orderId: s.orderId, captureId: 'CAP-SWEEP' }]);

    // the queued follow-up then pushes tracking against the capture the webhook recorded
    expect(await runTrackingPush(deps, s.orderId, 'CAP-SWEEP')).toBe('PUSHED');
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('rejects a tampered delivery and never acts on it', async () => {
    const s = await held();
    const { id, raw } = await receiveSigned('PAYMENT.AUTHORIZATION.VOIDED', { id: s.authorizationId });
    await h.t.db.query('update webhook_event set raw_body = $2 where event_id = $1', [id, Buffer.from(raw.toString().replace(s.authorizationId, 'FORGED'))]);
    const r = await runWebhookSweep(deps);
    expect(r.rejected).toBe(1);
    expect(r.processed).toBe(0);
    expect(await state(s.orderId)).toBe('HELD');
  });

  it('is a no-op when nothing is pending', async () => {
    await h.t.db.query('update webhook_event set processed_at = now() where processed_at is null');
    expect(await runWebhookSweep(deps)).toEqual({ verified: 0, rejected: 0, processed: 0, retrying: 0, gaveUp: 0, deferred: 0, followUps: 0 });
  });
});
