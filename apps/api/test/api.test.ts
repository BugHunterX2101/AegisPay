import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditHeadSeq, createPool, getOrder, insertProposal, withTx } from '@aegis/db';
import type { Db, MandateRecord } from '@aegis/db';
import { TEST_URL } from '@aegis/db/testing';
import { CertCache } from '@aegis/payments';
import { createJobSender } from '@aegis/jobs';
import type { JobSender } from '@aegis/jobs';
import { startHarness } from '../../../packages/payments/test/harness.ts';
import type { Harness } from '../../../packages/payments/test/harness.ts';
import { createWorker } from '../../worker/src/worker.ts';
import type { WorkerHandle } from '../../worker/src/worker.ts';
import { buildApp } from '../src/app.ts';
import { installErrorHandling } from '../src/errors.ts';
import { registerWebhooks, WEBHOOK_MAX_BYTES } from '../src/routes/webhooks.ts';

/**
 * The real API routes against real Postgres, a real pg-boss schema with the real worker consuming it, and the PayPal
 * contract double. Nothing about the order flow is stubbed: a deliver click ends with the worker capturing the hold.
 */
let h: Harness;
let worker: WorkerHandle;
let admin: Db;
let app: FastifyInstance;
const bossSchema = `boss_${randomBytes(5).toString('hex')}`;
const SECRET = 'test-session-secret-0123456789abcdef';

beforeAll(async () => {
  h = await startHarness();
  admin = createPool({ connectionString: TEST_URL, max: 1, applicationName: 'aegis-api-test-admin' });
  worker = await createWorker({
    connectionString: TEST_URL,
    schema: bossSchema,
    pipeline: { ctx: h.ctx, certs: new CertCache(h.clock), webhookId: undefined },
    clock: h.clock,
    log: () => undefined,
    pollingIntervalSeconds: 0.5,
    deferSeconds: 1,
  });
  app = await buildApp({
    deps: { db: h.t.db, ctx: h.ctx, clock: h.clock, jobs: createJobSender(worker.boss), appUrl: 'https://aegispay.example' },
    sessionSecret: SECRET,
    secureCookies: false,
    judgeMode: true,
    paypalClientId: 'public-client-id',
    heartbeatMs: 200,
    rateLimitMax: 10_000,
  });
});
afterAll(async () => {
  await app.close();
  await worker.stop();
  await admin.query(`drop schema if exists ${bossSchema} cascade`);
  await admin.end();
  await h.close();
});

async function until<T>(what: string, fn: () => Promise<T | undefined | false>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A browser: the session cookie, the CSRF cookie and the CSRF header, as GET /api/session hands them out. */
async function visitor(target: FastifyInstance = app) {
  const r = await target.inject({ method: 'GET', url: '/api/session' });
  expect(r.statusCode).toBe(200);
  const cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const { csrfToken, actor } = r.json<{ csrfToken: string; actor: string }>();
  const call = (method: 'GET' | 'POST', url: string, body?: unknown) =>
    target.inject({ method, url, headers: { cookie, 'x-csrf-token': csrfToken }, ...(body === undefined ? {} : { payload: body as object }) });
  return { actor, cookie, csrfToken, get: (url: string) => call('GET', url), post: (url: string, body?: unknown) => call('POST', url, body) };
}
type Visitor = Awaited<ReturnType<typeof visitor>>;

const draft = (over: Record<string, unknown> = {}) => ({
  spec: { keywords: ['usb-c cable'] },
  quantity: 10,
  unitCeiling: '18000',
  budget: '200000',
  currency: 'USD',
  deliverBy: '2036-11-25',
  ...over,
});
/** 10 x 12.50 + 5.00 shipping + 10.40 tax = 140.40 */
const TOTAL = '14040';

async function newMandate(v: Visitor, over: Record<string, unknown> = {}): Promise<MandateRecord> {
  const r = await v.post('/api/mandates', { draft: draft(over) });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<{ mandate: MandateRecord }>().mandate;
}
const propose = (m: { id: string; version: number }) =>
  withTx(
    (tx) =>
      insertProposal(tx, {
        mandateId: m.id, mandateVersion: m.version, productId: 'sku-1', domain: 'example.com', title: 'USB-C cable 2m',
        unitPriceMinor: 1250n, quantity: 10, shippingMinor: 500n, taxMinor: 1040n, eta: '2036-11-20', inStock: true,
        gatePass: true, gateResults: [], decisionSha256: randomBytes(32).toString('hex'),
      }),
    h.t.db,
  );
async function placed(v: Visitor, over: Record<string, unknown> = {}) {
  const m = await newMandate(v, over);
  const p = await propose(m);
  const r = await v.post(`/api/proposals/${p.id}/orders`, { decisionSha256: p.decisionSha256 });
  expect(r.statusCode, r.body).toBe(201);
  const { orderRowId, paypalOrderId } = r.json<{ orderRowId: string; paypalOrderId: string }>();
  return { m, p, orderId: orderRowId, paypalOrderId };
}
async function held(v: Visitor) {
  const o = await placed(v);
  h.pp.approve(o.paypalOrderId);
  const r = await v.post(`/api/orders/${o.orderId}/authorize`);
  expect(r.statusCode, r.body).toBe(200);
  return o;
}
const stateOf = async (id: string) => (await getOrder(h.t.db, id))!.state;
const errorOf = (r: { json: <T>() => T }) => r.json<{ error: { code: string; message: string; requestId: string } }>().error;

describe('session and CSRF', () => {
  it('refuses /api calls without a session, without a CSRF token, and with a forged cookie', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/orders' });
    expect(none.statusCode).toBe(403);
    expect(errorOf(none).code).toBe('FORBIDDEN');

    const v = await visitor();
    const noCsrf = await app.inject({ method: 'POST', url: '/api/mandates', headers: { cookie: v.cookie }, payload: { draft: draft() } });
    expect(noCsrf.statusCode).toBe(403);
    expect(errorOf(noCsrf).message).toMatch(/csrf/i);

    const forged = await app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: 'aegis_sid=attacker.deadbeef' } });
    expect(forged.statusCode).toBe(403);
  });

  it('hands out an identity for the audit log and the public PayPal client id, and keeps the same identity on a repeat visit', async () => {
    const v = await visitor();
    expect(v.actor).toMatch(/^user:/);
    const again = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: v.cookie } });
    expect(again.json()).toMatchObject({ actor: v.actor, judgeMode: true, paypalEnv: 'sandbox', paypalClientId: 'public-client-id' });
    expect(JSON.stringify(again.json())).not.toMatch(/secret/i);
    const set = (await app.inject({ method: 'GET', url: '/api/session' })).headers['set-cookie'];
    expect(String(set)).toMatch(/aegis_sid=.*HttpOnly.*SameSite=Lax/i);
  });

  it('serves /healthz without a session', async () => {
    const r = await app.inject({ method: 'GET', url: '/healthz' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it('sends a buyer returning from PayPal back to the app instead of a 404', async () => {
    const ok = await app.inject({ method: 'GET', url: '/approved?token=ABC&PayerID=XYZ' });
    expect(ok.statusCode).toBe(302);
    expect(ok.headers.location).toBe('/?paypal=approved');
    const no = await app.inject({ method: 'GET', url: '/cancelled?token=ABC' });
    expect(no.statusCode).toBe(302);
    expect(no.headers.location).toBe('/?paypal=cancelled');
  });

  it('answers with one error shape, a request id, and a generic message for an unknown route', async () => {
    const v = await visitor();
    const r = await v.get('/api/nope');
    expect(r.statusCode).toBe(404);
    expect(errorOf(r)).toMatchObject({ code: 'NOT_FOUND' });
    expect(errorOf(r).requestId).toMatch(/^req_/);
  });

  it('rate-limits /api routes with a RATE_LIMITED error but never the health check', async () => {
    const limited = await buildApp({
      deps: { db: h.t.db, ctx: h.ctx, clock: h.clock, jobs: createJobSender(worker.boss), appUrl: 'https://aegispay.example' },
      sessionSecret: SECRET, secureCookies: false, judgeMode: false, paypalClientId: 'x', rateLimitMax: 3,
    });
    try {
      const v = await visitor(limited);
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await v.get('/api/orders')).statusCode);
      expect(codes).toEqual([200, 200, 200, 429, 429]);
      expect(errorOf(await v.get('/api/orders')).code).toBe('RATE_LIMITED');
      for (let i = 0; i < 6; i++) expect((await limited.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it('rejects an /api body over 64 KB', async () => {
    const v = await visitor();
    const r = await v.post('/api/mandates', { draft: draft(), sourceText: 'x'.repeat(70_000) });
    expect(r.statusCode).toBe(413);
  });
});

describe('POST /webhooks/paypal', () => {
  const post = (payload: string | Buffer, extra: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/webhooks/paypal', headers: { 'content-type': 'application/json', ...extra }, payload });
  const stored = async (eventId: string) =>
    (await h.t.db.query<{ raw_body: Buffer; event_type: string; verified: string | null }>('select raw_body, event_type, verified from webhook_event where event_id = $1', [eventId])).rows[0];

  it('stores the exact bytes received (odd whitespace and non-ASCII included), unverified, and needs no session', async () => {
    const id = `WH-${randomBytes(6).toString('hex')}`;
    const body = `{ "id" :"${id}",\n  "event_type":"PAYMENT.CAPTURE.COMPLETED",  "note":"café ü" }`;
    const r = await post(body, { 'paypal-transmission-id': 'tx-1' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ received: true, duplicate: false });
    const row = await stored(id);
    expect(row!.raw_body.equals(Buffer.from(body, 'utf8'))).toBe(true);
    expect(row!.event_type).toBe('PAYMENT.CAPTURE.COMPLETED');
    expect(row!.verified).toBeNull(); // only the worker verifies the signature
  });

  it('treats a redelivery as a no-op and reports it', async () => {
    const id = `WH-${randomBytes(6).toString('hex')}`;
    const body = JSON.stringify({ id, event_type: 'CUSTOMER.DISPUTE.CREATED' });
    expect((await post(body)).json()).toEqual({ received: true, duplicate: false });
    expect((await post(body)).json()).toEqual({ received: true, duplicate: true });
    expect((await h.t.db.query('select 1 from webhook_event where event_id = $1', [id])).rowCount).toBe(1);
  });

  it('answers 200 and stores nothing for garbage, a missing id, or a missing type', async () => {
    const before = (await h.t.db.query('select 1 from webhook_event')).rowCount;
    for (const p of ['not json at all', '{"event_type":"X"}', '{"id":"WH-only-id"}', '[]', '{"id":42,"event_type":"X"}']) {
      const r = await post(p);
      expect(r.statusCode, p).toBe(200);
      expect(r.json(), p).toEqual({ received: false });
    }
    expect((await h.t.db.query('select 1 from webhook_event')).rowCount).toBe(before);
  });

  it('accepts a body well over the 64 KB API limit, up to 1 MB, and refuses anything larger with 413', async () => {
    const id = `WH-${randomBytes(6).toString('hex')}`;
    const big = JSON.stringify({ id, event_type: 'X.Y', pad: ' '.repeat(200_000) });
    expect((await post(big)).statusCode).toBe(200);
    const over = await post(Buffer.alloc(WEBHOOK_MAX_BYTES + 16, 0x20));
    expect(over.statusCode).toBe(413);
  });

  it('answers 500 when the event cannot be stored, so PayPal redelivers it', async () => {
    const dead = createPool({ connectionString: 'postgres://aegis:aegis@127.0.0.1:1/none', max: 1, applicationName: 'aegis-api-test-dead' });
    const solo = Fastify();
    installErrorHandling(solo);
    registerWebhooks(solo, { db: dead, ctx: h.ctx, clock: h.clock, jobs: createJobSender(worker.boss), appUrl: 'https://aegispay.example' });
    try {
      const r = await solo.inject({ method: 'POST', url: '/webhooks/paypal', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ id: 'WH-x', event_type: 'X.Y' }) });
      expect(r.statusCode).toBe(500);
      expect(errorOf(r).message).toBe('internal error'); // no connection string, no stack
    } finally {
      await solo.close();
      await dead.end().catch(() => undefined);
    }
  });

  it('still answers 200 when only the nudge to the worker fails: the event is stored and the sweep finds it', async () => {
    const down: JobSender = {
      webhookProcess: async () => {
        throw new Error('queue unavailable');
      },
      capture: async () => undefined,
      void: async () => undefined,
    };
    const solo = Fastify();
    installErrorHandling(solo);
    registerWebhooks(solo, { db: h.t.db, ctx: h.ctx, clock: h.clock, jobs: down, appUrl: 'https://aegispay.example' });
    const id = `WH-${randomBytes(6).toString('hex')}`;
    try {
      const r = await solo.inject({ method: 'POST', url: '/webhooks/paypal', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ id, event_type: 'X.Y' }) });
      expect(r.statusCode).toBe(200);
      expect(await stored(id)).toBeDefined();
    } finally {
      await solo.close();
    }
  });
});

describe('mandates', () => {
  it('creates, lists, amends, pauses and closes, serialising money as strings and tracking spend', async () => {
    const v = await visitor();
    const created = await v.post('/api/mandates', { draft: draft(), sourceText: 'Buy 10 USB-C cables under $180 each' });
    expect(created.statusCode).toBe(201);
    const m = created.json<{ mandate: { id: string; version: number; status: string; budgetMinor: string; spentMinor: string } }>().mandate;
    expect(m).toMatchObject({ version: 1, status: 'ACTIVE', budgetMinor: '200000', spentMinor: '0' });

    const amended = await v.post(`/api/mandates/${m.id}/amend`, { draft: draft({ budget: '250000' }) });
    expect(amended.json<{ mandate: { version: number; budgetMinor: string } }>().mandate).toMatchObject({ version: 2, budgetMinor: '250000' });

    const paused = await v.post(`/api/mandates/${m.id}/status`, { status: 'PAUSED' });
    expect(paused.json<{ mandate: { status: string; version: number } }>().mandate).toMatchObject({ status: 'PAUSED', version: 2 });

    const one = await v.get(`/api/mandates/${m.id}`);
    expect(one.json<{ mandate: { version: number }; proposals: unknown[] }>()).toMatchObject({ mandate: { version: 2 }, proposals: [] });
    const list = await v.get('/api/mandates');
    expect(list.json<{ mandates: Array<{ id: string }> }>().mandates.some((x) => x.id === m.id)).toBe(true);

    const closed = await v.post(`/api/mandates/${m.id}/status`, { status: 'CLOSED' });
    expect(closed.statusCode).toBe(200);
    const reopen = await v.post(`/api/mandates/${m.id}/status`, { status: 'ACTIVE' });
    expect(reopen.statusCode).toBe(409);
    expect(errorOf(reopen).code).toBe('MANDATE_NOT_ACTIVE');
  });

  it('refuses malformed input with the VALIDATION shape and a 404 for an unknown mandate', async () => {
    const v = await visitor();
    const bad = await v.post('/api/mandates', { draft: draft({ quantity: 0, budget: '12.50' }) });
    expect(bad.statusCode).toBe(400);
    expect(errorOf(bad).code).toBe('VALIDATION');
    expect((await v.get('/api/mandates/not-a-uuid')).statusCode).toBe(400);
    const missing = await v.get('/api/mandates/018f0000-0000-7000-8000-000000000000');
    expect(missing.statusCode).toBe(404);
  });

  it('records who acted: the audit row carries the visitor identity', async () => {
    const v = await visitor();
    const m = await newMandate(v);
    const { rows } = await h.t.db.query<{ actor: string }>(`select actor from audit_event where type = 'MANDATE_CREATED' and entity_id = $1`, [m.id]);
    expect(rows[0]!.actor).toBe(v.actor);
  });
});

describe('order flow', () => {
  it('propose -> hold -> approve -> ship -> deliver: the worker captures, and the audit chain stays intact', async () => {
    const v = await visitor();
    const o = await held(v);
    expect(await stateOf(o.orderId)).toBe('HELD');

    const badShip = await v.post(`/api/orders/${o.orderId}/ship`, { carrier: 'FEDEX', trackingNumber: 'no spaces allowed!' });
    expect(badShip.statusCode).toBe(400);
    const ship = await v.post(`/api/orders/${o.orderId}/ship`, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });
    expect(ship.statusCode).toBe(200);
    expect(ship.json<{ order: { state: string } }>().order.state).toBe('IN_TRANSIT');

    const deliver = await v.post(`/api/orders/${o.orderId}/deliver`);
    expect(deliver.statusCode).toBe(202);
    expect(deliver.json()).toMatchObject({ applied: true, captureQueued: true });
    await until('order SETTLED by the worker', async () => (await stateOf(o.orderId)) === 'SETTLED');

    // A late second click on an order that has already settled is refused, not silently re-queued.
    const again = await v.post(`/api/orders/${o.orderId}/deliver`);
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe('BAD_STATE');

    const grid = (await v.get('/api/orders')).json<{ orders: Array<{ id: string; state: string; amountMinor: string }> }>().orders;
    expect(grid.find((r) => r.id === o.orderId)).toMatchObject({ state: 'SETTLED', amountMinor: TOTAL });

    const events = (await v.get(`/api/orders/${o.orderId}/audit`)).json<{ events: Array<{ type: string }> }>().events.map((e) => e.type);
    expect(events).toEqual(expect.arrayContaining(['ORDER_CREATED', 'SHIPPED', 'DELIVERED', 'CAPTURED']));
    expect((await v.get('/api/audit/verify')).json()).toMatchObject({ ok: true });
  });

  it('creating an order is idempotent per proposal and refuses a stale or wrong decision hash', async () => {
    const v = await visitor();
    const m = await newMandate(v);
    const p = await propose(m);
    const wrong = await v.post(`/api/proposals/${p.id}/orders`, { decisionSha256: 'a'.repeat(64) });
    expect(wrong.statusCode).toBe(409);
    expect(errorOf(wrong).code).toBe('DECISION_STALE');
    expect((await v.post(`/api/proposals/${p.id}/orders`, { decisionSha256: 'not-hex' })).statusCode).toBe(400);

    const first = await v.post(`/api/proposals/${p.id}/orders`, { decisionSha256: p.decisionSha256 });
    const second = await v.post(`/api/proposals/${p.id}/orders`, { decisionSha256: p.decisionSha256 });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ created: false, reused: true, orderRowId: first.json<{ orderRowId: string }>().orderRowId });
    expect(second.json<{ paypalOrderId: string }>().paypalOrderId).toBe(first.json<{ paypalOrderId: string }>().paypalOrderId);
    expect((await v.post(`/api/proposals/018f0000-0000-7000-8000-000000000000/orders`, { decisionSha256: 'a'.repeat(64) })).statusCode).toBe(404);
  });

  it('enforces the budget (R6), mandate currency (R2) and mandate status when the order is created', async () => {
    const v = await visitor();
    const m = await newMandate(v, { budget: '20000' }); // room for one 140.40 order, not two
    const p1 = await propose(m);
    const p2 = await propose(m);
    expect((await v.post(`/api/proposals/${p1.id}/orders`, { decisionSha256: p1.decisionSha256 })).statusCode).toBe(201);
    const over = await v.post(`/api/proposals/${p2.id}/orders`, { decisionSha256: p2.decisionSha256 });
    expect(over.statusCode).toBe(409);
    expect(errorOf(over).code).toBe('GATE_FAILED');
    expect(((await v.get(`/api/mandates/${m.id}`)).json<{ mandate: { spentMinor: string } }>()).mandate.spentMinor).toBe(TOTAL);

    const m2 = await newMandate(v);
    const stale = await propose(m2);
    await v.post(`/api/mandates/${m2.id}/amend`, { draft: draft({ quantity: 11 }) });
    const r2 = await v.post(`/api/proposals/${stale.id}/orders`, { decisionSha256: stale.decisionSha256 });
    expect(r2.statusCode).toBe(409);
    expect(errorOf(r2).code).toBe('DECISION_STALE');

    const m3 = await newMandate(v);
    const p3 = await propose(m3);
    await v.post(`/api/mandates/${m3.id}/status`, { status: 'PAUSED' });
    const r3 = await v.post(`/api/proposals/${p3.id}/orders`, { decisionSha256: p3.decisionSha256 });
    expect(r3.statusCode).toBe(409);
    expect(errorOf(r3).code).toBe('MANDATE_NOT_ACTIVE');
  });

  it('refuses to authorize an order the buyer has not approved, and to ship or deliver out of order', async () => {
    const v = await visitor();
    const o = await placed(v);
    const early = await v.post(`/api/orders/${o.orderId}/authorize`);
    expect(early.statusCode).toBeGreaterThanOrEqual(400);
    expect(await stateOf(o.orderId)).toBe('AWAITING_APPROVAL');
    expect((await v.post(`/api/orders/${o.orderId}/ship`, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' })).statusCode).toBe(409);
    expect((await v.post(`/api/orders/${o.orderId}/deliver`)).statusCode).toBeGreaterThanOrEqual(400);
    expect(await stateOf(o.orderId)).toBe('AWAITING_APPROVAL');
  });

  it('cancels an order that was never approved (a repeat is a no-op), and refuses once a hold exists', async () => {
    const v = await visitor();
    const o = await placed(v);
    const c = await v.post(`/api/orders/${o.orderId}/cancel`);
    expect(c.statusCode).toBe(200);
    expect(c.json()).toMatchObject({ applied: true });
    expect(await stateOf(o.orderId)).toBe('CANCELLED');
    const again = await v.post(`/api/orders/${o.orderId}/cancel`);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ applied: false });

    const hold = await held(v);
    const refused = await v.post(`/api/orders/${hold.orderId}/cancel`);
    expect(refused.statusCode).toBe(409);
    expect(errorOf(refused).code).toBe('BAD_STATE');
    expect(await stateOf(hold.orderId)).toBe('HELD');
  });

  it('void needs explicit confirmation, is audited with who confirmed, runs through the worker, and is idempotent', async () => {
    const v = await visitor();
    const o = await held(v);
    expect((await v.post(`/api/orders/${o.orderId}/void`, { reason: 'SLA_BREACH' })).statusCode).toBe(400);
    expect((await v.post(`/api/orders/${o.orderId}/void`, { reason: 'SLA_BREACH', confirm: false })).statusCode).toBe(400);
    expect(await stateOf(o.orderId)).toBe('HELD');

    const r = await v.post(`/api/orders/${o.orderId}/void`, { reason: 'SLA_BREACH', confirm: true });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({ queued: true });
    await until('order VOIDED by the worker', async () => (await stateOf(o.orderId)) === 'VOIDED');

    const { rows } = await h.t.db.query<{ payload: { confirmedBy: string; reason: string } }>(
      `select payload from audit_event where type = 'VOID_REQUESTED' and entity_id = $1`,
      [o.orderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toMatchObject({ reason: 'SLA_BREACH', confirmedBy: v.actor });

    const repeat = await v.post(`/api/orders/${o.orderId}/void`, { reason: 'SLA_BREACH', confirm: true });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).toMatchObject({ queued: false });
  });

  it('cannot void an order that holds no authorization or has already settled', async () => {
    const v = await visitor();
    const o = await placed(v);
    const r = await v.post(`/api/orders/${o.orderId}/void`, { reason: 'CANCEL', confirm: true });
    expect(r.statusCode).toBe(409);
    expect(errorOf(r).code).toBe('BAD_STATE');
    expect((await v.post(`/api/orders/018f0000-0000-7000-8000-000000000000/void`, { reason: 'CANCEL', confirm: true })).statusCode).toBe(404);
  });
});

describe('disputes', () => {
  /** A real settled order, then a dispute PayPal opened on its capture. */
  async function settledOrder(v: Visitor) {
    const o = await held(v);
    expect((await v.post(`/api/orders/${o.orderId}/ship`, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' })).statusCode).toBe(200);
    expect((await v.post(`/api/orders/${o.orderId}/deliver`)).statusCode).toBe(202);
    await until('order SETTLED by the worker', async () => (await stateOf(o.orderId)) === 'SETTLED');
    return { ...o, captureId: (await getOrder(h.t.db, o.orderId))!.captureId! };
  }

  it('syncs a dispute, builds a bundle for a human to read, and sends it only after attestation', async () => {
    const v = await visitor();
    const o = await settledOrder(v);
    const pp = h.pp.addDispute({ captureId: o.captureId, reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' });

    // Not known to us until we pull it.
    expect((await v.get(`/api/disputes/${pp.id}`)).statusCode).toBe(404);
    const sync = await v.post(`/api/disputes/${pp.id}/sync`);
    expect(sync.statusCode, sync.body).toBe(200);
    expect(sync.json()).toMatchObject({ orderId: o.orderId, orderState: 'DISPUTED', moved: 'DISPUTED' });
    expect((await v.get('/api/disputes')).json<{ disputes: Array<{ paypalDisputeId: string }> }>().disputes.map((x) => x.paypalDisputeId)).toContain(pp.id);

    const plan = await v.post(`/api/disputes/${pp.id}/plan`);
    expect(plan.statusCode, plan.body).toBe(201);
    const built = plan.json<{ status: string; bundle: { id: string; sha256: string; notes: string; files: Array<{ name: string; sha256: string }> } }>();
    expect(built.status).toBe('BUILT');
    expect(built.bundle.notes).toContain('1Z999AA10123456784');
    expect(built.bundle.files.length).toBeGreaterThan(0);

    // The human reads the exact bytes that would be sent.
    const file = built.bundle.files[0]!;
    const pdf = await v.get(`/api/evidence/${built.bundle.id}/files/${file.name}`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.headers['x-content-sha256']).toBe(file.sha256);
    expect((await v.get(`/api/evidence/${built.bundle.id}/files/..%2Fx.pdf`)).statusCode).toBe(400);

    // No attestation, no send; a bundle of another dispute is refused.
    expect((await v.post(`/api/disputes/${pp.id}/submit`, { bundleId: built.bundle.id })).statusCode).toBe(400);
    expect((await v.post(`/api/disputes/${pp.id}/submit`, { bundleId: built.bundle.id, attested: false })).statusCode).toBe(400);
    expect((await v.post(`/api/disputes/PP-D-OTHER/submit`, { bundleId: built.bundle.id, attested: true })).statusCode).toBe(404);
    expect(await stateOf(o.orderId)).toBe('DISPUTED');

    const sent = await v.post(`/api/disputes/${pp.id}/submit`, { bundleId: built.bundle.id, attested: true });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json()).toMatchObject({ submitted: true, orderId: o.orderId });
    expect(await stateOf(o.orderId)).toBe('EVIDENCE_SUBMITTED');

    // Once sent it cannot be sent again.
    expect((await v.post(`/api/disputes/${pp.id}/submit`, { bundleId: built.bundle.id, attested: true })).statusCode).toBe(409);

    const detail = (await v.get(`/api/disputes/${pp.id}`)).json<{ bundle: { reviewedBy: string; submittedAt: string }; events: Array<{ type: string }> }>();
    expect(detail.bundle.reviewedBy).toBe(v.actor.replace(/^user:/, ''));
    expect(detail.bundle.submittedAt).toBeTruthy();
    expect(detail.events.map((e) => e.type)).toEqual(expect.arrayContaining(['DISPUTE_SYNCED', 'EVIDENCE_BUNDLE_BUILT', 'EVIDENCE_REVIEWED', 'EVIDENCE_SUBMITTED']));
    expect((await v.get('/api/audit/verify')).json()).toMatchObject({ ok: true });
  });

  it('refuses a malformed dispute id and a plan for a dispute that was never synced', async () => {
    const v = await visitor();
    expect((await v.get('/api/disputes/a%20b')).statusCode).toBe(400);
    expect((await v.post('/api/disputes/PP-D-UNKNOWN/plan')).statusCode).toBe(404);
  });
});

describe('GET /api/audit/verify', () => {
  it('reports an intact chain with its head and count, and reports the first bad row when a row is tampered with', async () => {
    const v = await visitor();
    await newMandate(v);
    const ok = (await v.get('/api/audit/verify')).json<{ ok: boolean; count: string; head: string }>();
    expect(ok.ok).toBe(true);
    expect(ok.head).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(ok.count)).toBeGreaterThan(0);

    // The table refuses UPDATE for everyone; the only way to forge a row is to switch that guard off, as an attacker with DBA rights would.
    const forge = (payload: string, seq: string) =>
      withTx(async (tx) => {
        await tx.query('alter table audit_event disable trigger audit_event_no_update_delete');
        await tx.query('update audit_event set payload = $2::jsonb where seq = $1', [seq, payload]);
        await tx.query('alter table audit_event enable trigger audit_event_no_update_delete');
      }, h.t.db);
    await expect(h.t.db.query(`update audit_event set payload = '{}'::jsonb where seq = 1`)).rejects.toThrow(/append-only/);

    const { rows } = await h.t.db.query<{ seq: string; payload: unknown }>('select seq, payload from audit_event order by seq desc limit 1');
    const seq = rows[0]!.seq;
    await forge('{"tampered":true}', seq);
    try {
      const bad = await v.get('/api/audit/verify');
      expect(bad.statusCode).toBe(200); // the verdict is the payload, not an HTTP failure
      expect(bad.json()).toMatchObject({ ok: false, firstBadSeq: String(seq), reason: 'HASH_MISMATCH' });
    } finally {
      await forge(JSON.stringify(rows[0]!.payload), seq);
    }
    expect((await v.get('/api/audit/verify')).json()).toMatchObject({ ok: true });
  });
});

describe('GET /api/stream', () => {
  interface Frame {
    id?: string;
    event?: string;
    data?: string;
    comment?: string;
  }
  const parse = (raw: string): Frame => {
    const f: Frame = {};
    for (const line of raw.split('\n')) {
      if (line.startsWith(': ')) f.comment = line.slice(2);
      else if (line.startsWith('id: ')) f.id = line.slice(4);
      else if (line.startsWith('event: ')) f.event = line.slice(7);
      else if (line.startsWith('data: ')) f.data = line.slice(6);
    }
    return f;
  };

  /** Read a real SSE connection until `done` says enough. `onReady` runs once the server says it is live. */
  async function readStream(base: string, headers: Record<string, string>, done: (frames: Frame[]) => boolean, onReady?: () => Promise<unknown>): Promise<Frame[]> {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/stream`, { headers, signal: ac.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const frames: Frame[] = [];
    let buf = '';
    let readyFired = false;
    let pending: Promise<unknown> | undefined;
    const end = Date.now() + 15_000;
    try {
      while (Date.now() < end) {
        const { value, done: closed } = await reader.read();
        if (closed) break;
        buf += dec.decode(value, { stream: true });
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          frames.push(parse(buf.slice(0, i)));
          buf = buf.slice(i + 2);
        }
        if (!readyFired && frames.some((f) => f.comment === 'ready')) {
          readyFired = true;
          pending = onReady?.();
        }
        if (done(frames)) break;
      }
    } finally {
      ac.abort();
    }
    await pending;
    return frames;
  }

  let base = '';
  beforeAll(async () => {
    base = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  it('refuses a connection without a session', async () => {
    const res = await fetch(`${base}/api/stream`);
    expect(res.status).toBe(403);
  });

  it('pushes an order change live, as the order row the grid shows', async () => {
    const v = await visitor();
    let orderId = '';
    const frames = await readStream(
      base,
      { cookie: v.cookie },
      // The stream is shared by every open tab, so a late update from an earlier test's order can arrive first:
      // wait for the upsert of the order this test placed, not merely the first upsert.
      (fs) => orderId !== '' && fs.some((f) => f.event === 'order.upsert' && (JSON.parse(f.data!) as { id: string }).id === orderId),
      async () => {
        orderId = (await placed(v)).orderId;
      },
    );
    const f = frames.find((x) => x.event === 'order.upsert' && (JSON.parse(x.data!) as { id: string }).id === orderId)!;
    expect(f.id).toMatch(/^\d+$/);
    const row = JSON.parse(f.data!) as { id: string; state: string; amountMinor: string };
    expect(row.id).toBe(orderId);
    expect(row).toMatchObject({ state: 'AWAITING_APPROVAL', amountMinor: TOTAL });
  });

  it('replays what a reconnecting client missed from Last-Event-ID, in order and without duplicates', async () => {
    const v = await visitor();
    const head = await auditHeadSeq(h.t.db);
    const a = await placed(v);
    await v.post(`/api/orders/${a.orderId}/cancel`);
    const b = await placed(v);
    const frames = await readStream(base, { cookie: v.cookie, 'last-event-id': String(head) }, (fs) => fs.some((f) => f.comment === 'ready'));
    const upserts = frames.filter((f) => f.event === 'order.upsert');
    const byOrder = new Map(upserts.map((f) => [(JSON.parse(f.data!) as { id: string }).id, JSON.parse(f.data!) as { state: string }]));
    expect(byOrder.get(a.orderId)!.state).toBe('CANCELLED'); // collapsed to the latest state, not two messages
    expect(byOrder.get(b.orderId)!.state).toBe('AWAITING_APPROVAL');
    expect(upserts.filter((f) => (JSON.parse(f.data!) as { id: string }).id === a.orderId)).toHaveLength(1);
    const ids = upserts.map((f) => BigInt(f.id!));
    expect([...ids].sort((x, y) => (x < y ? -1 : 1))).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pushes a fresh self-check result as an ephemeral event: no id, never replayed', async () => {
    const v = await visitor();
    const frames = await readStream(
      base,
      { cookie: v.cookie },
      (fs) => fs.some((f) => f.event === 'selfcheck.result'),
      async () => {
        const r = await app.inject({ method: 'GET', url: '/api/selfcheck' });
        expect(r.statusCode).toBe(200);
      },
    );
    const f = frames.find((x) => x.event === 'selfcheck.result')!;
    expect(f.id).toBeUndefined(); // an id would make a reconnecting client replay it
    const body = JSON.parse(f.data!) as { probes: { name: string; ok: boolean }[]; checkedAt: string };
    expect(body.probes.map((p) => p.name).sort()).toEqual(['channel3', 'db', 'order', 'token', 'webhook']);
    expect(body.probes.find((p) => p.name === 'db')!.ok).toBe(true);

    // A reconnect from the beginning does not resend it.
    const again = await readStream(base, { cookie: v.cookie, 'last-event-id': '0' }, (fs) => fs.some((x) => x.comment === 'ready'));
    expect(again.some((x) => x.event === 'selfcheck.result')).toBe(false);
  });

  it('sends a heartbeat comment so an idle connection is not dropped by a proxy', async () => {
    const v = await visitor();
    const frames = await readStream(base, { cookie: v.cookie }, (fs) => fs.some((f) => f.comment === 'heartbeat'));
    expect(frames.some((f) => f.comment === 'heartbeat')).toBe(true);
  });
});
