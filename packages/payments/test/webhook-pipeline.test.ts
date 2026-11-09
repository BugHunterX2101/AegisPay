import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getOrder, getWebhookEvent, markWebhookVerified, recordWebhookEvent, transition, verifyChain, withTx } from '@aegis/db';
import { capture } from '../src/authorizations.ts';
import { authorizeHold, createHold } from '../src/orders.ts';
import { WEBHOOK_MAX_ATTEMPTS, processPendingWebhooks, verifyPendingWebhooks } from '../src/webhooks/pipeline.ts';
import type { WebhookPipeline } from '../src/webhooks/pipeline.ts';
import { CertCache } from '../src/webhooks/verify-offline.ts';
import { seedFulfillment, seedGatedOrder, startHarness } from './harness.ts';
import type { Harness } from './harness.ts';
import { makeCert, signWebhook } from './webhook-signing.ts';

const WEBHOOK_ID = 'WH-PIPELINE-1';
const cert = makeCert();

let h: Harness;
let pipe: WebhookPipeline;
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
  h.sleeps.length = 0;
  h.writes.enabled = true;
});

const APP = 'https://aegispay.example';
const ev = (type: string, resource: object = { id: 'X' }) => {
  const id = `WH-Q-${randomUUID()}`;
  return { id, type, raw: Buffer.from(JSON.stringify({ id, event_type: type, resource }), 'utf8') };
};
/** A delivery exactly as PayPal sends it: signed over the raw bytes, then stored by the listener. */
async function receiveSigned(type: string, resource?: object) {
  const e = ev(type, resource);
  await recordWebhookEvent(h.t.db, { eventId: e.id, eventType: type, rawBody: e.raw, headers: signWebhook(e.raw, cert, { webhookId: WEBHOOK_ID }) });
  return e.id;
}
const row = async (id: string) => (await getWebhookEvent(h.t.db, id))!;
const auditCountAll = async (type: string) =>
  Number((await h.t.db.query<{ n: string }>(`select count(*) n from audit_event where type = $1`, [type])).rows[0]!.n);

describe('verifyPendingWebhooks', () => {
  it('verifies a genuine delivery through PayPal (postback) and leaves it for processing', async () => {
    const id = await receiveSigned('BILLING.SUBSCRIPTION.CREATED');
    const pass = await verifyPendingWebhooks(pipe);
    expect(pass.verified).toBeGreaterThanOrEqual(1);
    expect(await row(id)).toMatchObject({ verified: 'POSTBACK', processedAt: null, error: null });
  });

  it('records a tampered body as FAILED and closes it, so it can never be acted on', async () => {
    const e = ev('PAYMENT.CAPTURE.COMPLETED', { id: 'CAP-1' });
    const headers = signWebhook(e.raw, cert, { webhookId: WEBHOOK_ID });
    const tampered = Buffer.from(e.raw.toString().replace('CAP-1', 'CAP-2'));
    await recordWebhookEvent(h.t.db, { eventId: e.id, eventType: 'PAYMENT.CAPTURE.COMPLETED', rawBody: tampered, headers });
    const pass = await verifyPendingWebhooks(pipe);
    expect(pass.rejected).toBeGreaterThanOrEqual(1);
    const r = await row(e.id);
    expect(r.verified).toBe('FAILED');
    expect(r.processedAt).not.toBeNull();
    expect(r.error).toMatch(/FAILURE|MISMATCH|VERIFICATION/i);
    // and the processing pass never sees it
    const out = await processPendingWebhooks(pipe);
    expect(out.outcomes.find((o) => o.eventId === e.id)).toBeUndefined();
  });

  it('fails closed without a webhook id: nothing is verified, nothing is touched', async () => {
    const id = await receiveSigned('BILLING.SUBSCRIPTION.CREATED');
    const pass = await verifyPendingWebhooks({ ...pipe, webhookId: undefined });
    expect(pass).toEqual({ verified: 0, rejected: 0, retrying: 0, gaveUp: 0 });
    expect(await row(id)).toMatchObject({ verified: null, processedAt: null, attempts: 0 });
    await verifyPendingWebhooks(pipe); // leave nothing pending for the other tests
  });

  it('treats a PayPal outage as an attempt, not a verdict, and gives up after the cap', async () => {
    const id = await receiveSigned('BILLING.SUBSCRIPTION.CREATED');
    h.pp.failures.push({ match: /POST \/v1\/notifications\/verify-webhook-signature/, count: 1000, status: 503 });
    for (let i = 1; i < WEBHOOK_MAX_ATTEMPTS; i++) {
      const pass = await verifyPendingWebhooks(pipe);
      expect(pass.retrying).toBe(1);
      expect(await row(id)).toMatchObject({ verified: null, processedAt: null, attempts: i });
    }
    const last = await verifyPendingWebhooks(pipe);
    expect(last.gaveUp).toBe(1);
    expect(await row(id)).toMatchObject({ verified: null, attempts: WEBHOOK_MAX_ATTEMPTS });
    expect((await row(id)).processedAt).not.toBeNull();
    expect((await row(id)).error).toMatch(/^verification:/);
  });
});

describe('processPendingWebhooks', () => {
  beforeEach(async () => {
    // start every test from an empty queue
    await h.t.db.query(`update webhook_event set processed_at = now() where processed_at is null`);
  });

  it('never claims an event that is unverified or FAILED', async () => {
    const unverified = await receiveSigned('BILLING.SUBSCRIPTION.CREATED');
    const failed = await receiveSigned('BILLING.SUBSCRIPTION.CREATED');
    await markWebhookVerified(h.t.db, failed, 'FAILED', 'bad');
    const pass = await processPendingWebhooks(pipe);
    expect(pass.outcomes).toEqual([]);
    expect((await row(unverified)).processedAt).toBeNull();
    expect((await row(failed)).processedAt).toBeNull();
  });

  it('processes a verified event once and marks it processed; an ignored type says so in `error`', async () => {
    const id = await receiveSigned('BILLING.SUBSCRIPTION.CREATED');
    await verifyPendingWebhooks(pipe);
    const pass = await processPendingWebhooks(pipe);
    expect(pass.outcomes.map((o) => [o.eventId, o.action])).toEqual([[id, 'IGNORED']]);
    const r = await row(id);
    expect(r.processedAt).not.toBeNull();
    expect(r.error).toMatch(/^ignored:/);
    expect((await processPendingWebhooks(pipe)).outcomes).toEqual([]);
  });

  it('two workers pulling at once handle each event exactly once', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => receiveSigned('BILLING.SUBSCRIPTION.CREATED')));
    await verifyPendingWebhooks(pipe);
    const [a, b] = await Promise.all([processPendingWebhooks(pipe, { limit: 8 }), processPendingWebhooks(pipe, { limit: 8 })]);
    const handled = [...a.outcomes, ...b.outcomes].map((o) => o.eventId);
    expect(handled.sort()).toEqual([...ids].sort());
    expect(new Set(handled).size).toBe(ids.length);
  });

  it('retries a failing event, then gives up after the cap with an audit row, and never loops forever', async () => {
    // A real delivered order whose capture PayPal made first; the webhook handler must re-read the capture, which fails.
    const s = await seedGatedOrder(h.t);
    const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'cables' }, appUrl: APP });
    h.pp.approve(paypalOrderId);
    const a = await authorizeHold(h.ctx, s.orderId, paypalOrderId);
    await withTx((tx) => transition(tx, s.orderId, ['HELD'], 'IN_TRANSIT'), h.t.db);
    await withTx((tx) => transition(tx, s.orderId, ['IN_TRANSIT'], 'DELIVERED'), h.t.db);
    await seedFulfillment(h.t, s.orderId);
    h.pp.captures.set('CAP-FAILING', { id: 'CAP-FAILING', amount: { currency_code: 'USD', value: '140.40' }, refundedMinor: 0, refundIds: [] });
    h.pp.auths.get(a.authorizationId)!.status = 'CAPTURED';
    const id = await receiveSigned('PAYMENT.CAPTURE.COMPLETED', {
      id: 'CAP-FAILING',
      supplementary_data: { related_ids: { authorization_id: a.authorizationId, order_id: paypalOrderId } },
    });
    await verifyPendingWebhooks(pipe);

    h.pp.failures.push({ match: /GET \/v2\/payments\/captures\/CAP-FAILING/, count: 1000, status: 500 });
    for (let i = 1; i < WEBHOOK_MAX_ATTEMPTS; i++) {
      const pass = await processPendingWebhooks(pipe);
      expect(pass).toMatchObject({ retrying: 1, gaveUp: 0, outcomes: [] });
      expect(await row(id)).toMatchObject({ attempts: i, processedAt: null });
    }
    const before = await auditCountAll('WEBHOOK_GAVE_UP');
    const last = await processPendingWebhooks(pipe);
    expect(last).toMatchObject({ gaveUp: 1, retrying: 0 });
    const closed = await row(id);
    expect(closed.processedAt).not.toBeNull();
    expect(closed.error).toBeTruthy();
    expect(await auditCountAll('WEBHOOK_GAVE_UP')).toBe(before + 1);
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('DELIVERED'); // a failed event changed nothing
    expect(await processPendingWebhooks(pipe)).toMatchObject({ outcomes: [], retrying: 0, gaveUp: 0 });
  });

  it('gives up on one event and still finishes a later event in the same batch whose handler writes audit (no lock deadlock)', async () => {
    // Event 1 fails at the attempt cap; event 2's handler appends an audit row (WEBHOOK_UNLINKED) on its own connection.
    // If the give-up audit row took the chain lock on the batch transaction before event 2 ran, this pass would hang.
    const failing = await receiveSigned('CUSTOMER.DISPUTE.CREATED', { dispute_id: 'PP-D-DEADLOCK' });
    const later = await receiveSigned('PAYMENT.AUTHORIZATION.VOIDED', { id: `AUTH-UNKNOWN-${randomUUID()}` });
    await verifyPendingWebhooks(pipe);
    h.pp.failures.push({ match: /GET \/v1\/customer\/disputes\/PP-D-DEADLOCK/, count: 1000, status: 400 });

    const before = await auditCountAll('WEBHOOK_GAVE_UP');
    const pass = await Promise.race([
      processPendingWebhooks({ ...pipe, maxAttempts: 1 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('processPendingWebhooks deadlocked')), 15_000)),
    ]);
    expect(pass).toMatchObject({ gaveUp: 1, retrying: 0 });
    expect(pass.outcomes.map((o) => [o.eventId, o.action])).toEqual([[later, 'UNLINKED']]);
    expect(await auditCountAll('WEBHOOK_GAVE_UP')).toBe(before + 1);
    expect((await row(failing)).processedAt).not.toBeNull();
    expect(await verifyChain(h.t.db)).toMatchObject({ ok: true });
  }, 30_000);

  it('keeps an event for later, without counting an attempt, while PayPal writes are switched off', async () => {
    const s = await seedGatedOrder(h.t);
    const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'cables' }, appUrl: APP });
    h.pp.approve(paypalOrderId);
    const id = await receiveSigned('CHECKOUT.ORDER.APPROVED', { id: paypalOrderId });
    await verifyPendingWebhooks(pipe);

    h.writes.enabled = false;
    const off = await processPendingWebhooks(pipe);
    expect(off).toMatchObject({ deferred: 1, retrying: 0, gaveUp: 0, outcomes: [] });
    expect(await row(id)).toMatchObject({ attempts: 0, processedAt: null });
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('AWAITING_APPROVAL');

    h.writes.enabled = true;
    const on = await processPendingWebhooks(pipe);
    expect(on.outcomes.map((o) => o.action)).toEqual(['APPLIED']);
    expect((await getOrder(h.t.db, s.orderId))!.state).toBe('HELD');
    expect((await row(id)).processedAt).not.toBeNull();
  });

  it('a signed capture webhook drives a DELIVERED order to SETTLED end to end, and the chain verifies', async () => {
    const s = await seedGatedOrder(h.t);
    const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'cables' }, appUrl: APP });
    h.pp.approve(paypalOrderId);
    const a = await authorizeHold(h.ctx, s.orderId, paypalOrderId);
    await withTx((tx) => transition(tx, s.orderId, ['HELD'], 'IN_TRANSIT'), h.t.db);
    await withTx((tx) => transition(tx, s.orderId, ['IN_TRANSIT'], 'DELIVERED'), h.t.db);
    await seedFulfillment(h.t, s.orderId);
    h.pp.captures.set('CAP-E2E', { id: 'CAP-E2E', amount: { currency_code: 'USD', value: '140.40' }, refundedMinor: 0, refundIds: [] });
    h.pp.auths.get(a.authorizationId)!.status = 'CAPTURED';
    await receiveSigned('PAYMENT.CAPTURE.COMPLETED', {
      id: 'CAP-E2E',
      supplementary_data: { related_ids: { authorization_id: a.authorizationId, order_id: paypalOrderId } },
    });

    expect((await verifyPendingWebhooks(pipe)).verified).toBe(1);
    const pass = await processPendingWebhooks(pipe);
    expect(pass.outcomes.map((o) => o.action)).toEqual(['APPLIED']);
    expect(pass.outcomes[0]!.followUps).toHaveLength(1);
    expect(await getOrder(h.t.db, s.orderId)).toMatchObject({ state: 'SETTLED', captureId: 'CAP-E2E' });
    expect((await verifyChain(h.t.db)).ok).toBe(true);
    // capture() after the fact is a no-op that reuses the recorded capture
    expect(await capture(h.ctx, s.orderId)).toMatchObject({ captureId: 'CAP-E2E', reused: true });
  });
});
