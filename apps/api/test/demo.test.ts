import { OffsetClock, DAY_MS } from '@aegis/core';
import { getClockOffsetMs, watchClockOffset } from '@aegis/db';
import type { Channel3Config } from '@aegis/agents';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness } from '../../../packages/payments/test/harness.ts';
import type { Harness } from '../../../packages/payments/test/harness.ts';
import type { JobSender } from '@aegis/jobs';
import { buildApp } from '../src/app.ts';

/**
 * Judge Mode controls and the live self-check, through the real routes against real Postgres and the PayPal contract
 * double. The clock offset is shared through the database, which is how the separate worker process sees it.
 */
let h: Harness;
let on: FastifyInstance; // Judge Mode on, with a settable clock
let off: FastifyInstance; // Judge Mode off
let demoClock: OffsetClock;
const SECRET = 'test-session-secret-0123456789abcdef';
const noJobs = { send: async () => Promise.reject(new Error('the demo routes must not queue jobs')) } as unknown as JobSender;

/** A Channel3-shaped answer from a real client, so the catalog probe has something to count. */
const catalog: Channel3Config = {
  apiKey: 'test-channel3-key',
  baseUrl: 'http://127.0.0.1:1',
  fetchImpl: (async () =>
    new Response(
      JSON.stringify({
        products: [{ id: 'p1', title: 'USB cable', key_features: [], ratings: { value: 4.5, count: 10 }, offers: [{ url: 'https://shop.example/x', domain: 'shop.example', price: { price: 4.5, currency: 'USD' }, availability: 'InStock', condition: 'new' }] }],
        next_page_token: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch,
};

const make = (judgeMode: boolean, extra: Record<string, unknown>) =>
  buildApp({
    deps: { db: h.t.db, ctx: h.ctx, clock: h.clock, jobs: noJobs, appUrl: 'https://aegispay.example', ...extra },
    sessionSecret: SECRET,
    secureCookies: false,
    judgeMode,
    paypalClientId: 'public-client-id',
    heartbeatMs: 200,
    rateLimitMax: 10_000,
  });

beforeAll(async () => {
  h = await startHarness();
  demoClock = new OffsetClock(0);
  on = await make(true, { clock: demoClock, demoClock, channel3: catalog });
  off = await make(false, {});
});
afterAll(async () => {
  await on.close();
  await off.close();
  await h.close();
});

async function visitor(target: FastifyInstance) {
  const r = await target.inject({ method: 'GET', url: '/api/session' });
  const cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const { csrfToken, actor } = r.json<{ csrfToken: string; actor: string }>();
  const call = (method: 'GET' | 'POST', url: string, body?: unknown) =>
    target.inject({ method, url, headers: { cookie, 'x-csrf-token': csrfToken }, ...(body === undefined ? {} : { payload: body as object }) });
  return { actor, get: (url: string) => call('GET', url), post: (url: string, body?: unknown) => call('POST', url, body) };
}
const errorOf = (r: { json: <T>() => T }) => r.json<{ error: { code: string; message: string } }>().error;
const auditCount = async (type: string) =>
  Number((await h.t.db.query<{ n: string }>('select count(*) n from audit_event where type = $1', [type])).rows[0]!.n);

describe('Judge Mode off', () => {
  it('reads the clock but refuses to move it or to reset anything', async () => {
    const v = await visitor(off);
    const read = await v.get('/api/demo/clock');
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ offsetDays: 0, judgeMode: false });

    const set = await v.post('/api/demo/clock', { offsetDays: 3 });
    expect(set.statusCode).toBe(403);
    expect(errorOf(set).code).toBe('FORBIDDEN');
    const reset = await v.post('/api/demo/reset');
    expect(reset.statusCode).toBe(403);
    expect(await getClockOffsetMs(h.t.db)).toBe(0);
  });
});

describe('demo clock', () => {
  it('moves the app clock, stores the offset, audits who did it, and the worker side follows through the database', async () => {
    const v = await visitor(on);
    const workerClock = new OffsetClock(0); // what the worker process holds
    const watch = await watchClockOffset(h.t.db, workerClock, { intervalMs: 50 });
    try {
      const before = await auditCount('DEMO_CLOCK_SET');
      const r = await v.post('/api/demo/clock', { offsetDays: 3 });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toMatchObject({ offsetDays: 3 });

      expect(demoClock.offset).toBe(3 * DAY_MS);
      expect(await getClockOffsetMs(h.t.db)).toBe(3 * DAY_MS);
      expect((await v.get('/api/demo/clock')).json()).toMatchObject({ offsetDays: 3, judgeMode: true });

      const row = (await h.t.db.query<{ actor: string; payload: { offsetDays: number } }>(`select actor, payload from audit_event where type = 'DEMO_CLOCK_SET' order by seq desc limit 1`)).rows[0]!;
      expect(row.actor).toBe(v.actor);
      expect(row.payload).toEqual({ offsetDays: 3 });
      expect(await auditCount('DEMO_CLOCK_SET')).toBe(before + 1);

      const deadline = Date.now() + 5_000;
      while (workerClock.offset !== 3 * DAY_MS && Date.now() < deadline) await new Promise((res) => setTimeout(res, 25));
      expect(workerClock.offset).toBe(3 * DAY_MS);
    } finally {
      watch.stop();
    }
  });

  it('rejects an offset outside 0..60 days and leaves the clock where it was', async () => {
    const v = await visitor(on);
    const was = await getClockOffsetMs(h.t.db);
    for (const bad of [61, -1, 1.5, 'x']) {
      const r = await v.post('/api/demo/clock', { offsetDays: bad });
      expect(r.statusCode, String(bad)).toBeGreaterThanOrEqual(400);
      expect(r.statusCode).toBeLessThan(500);
    }
    expect(await getClockOffsetMs(h.t.db)).toBe(was);
  });
});

describe('demo reset', () => {
  it('empties the demo tables and the clock but only appends to the audit chain, which still verifies', async () => {
    const v = await visitor(on);
    const m = await v.post('/api/mandates', {
      draft: { spec: { keywords: ['usb-c cable'] }, quantity: 10, unitCeiling: '18000', budget: '200000', currency: 'USD', deliverBy: '2036-11-25' },
    });
    expect(m.statusCode, m.body).toBe(201);
    expect((await v.post('/api/demo/clock', { offsetDays: 5 })).statusCode).toBe(200);

    const auditBefore = Number((await h.t.db.query<{ n: string }>('select count(*) n from audit_event')).rows[0]!.n);
    const mandatesBefore = Number((await h.t.db.query<{ n: string }>('select count(*) n from mandate')).rows[0]!.n);
    expect(mandatesBefore).toBeGreaterThan(0);

    const r = await v.post('/api/demo/reset');
    expect(r.statusCode, r.body).toBe(200);
    const body = r.json<{ ok: boolean; deleted: Record<string, number> }>();
    expect(body.ok).toBe(true);
    expect(body.deleted.mandate).toBe(mandatesBefore);

    expect(Number((await h.t.db.query<{ n: string }>('select count(*) n from mandate')).rows[0]!.n)).toBe(0);
    expect(demoClock.offset).toBe(0);
    expect(await getClockOffsetMs(h.t.db)).toBe(0);

    const auditAfter = Number((await h.t.db.query<{ n: string }>('select count(*) n from audit_event')).rows[0]!.n);
    expect(auditAfter).toBe(auditBefore + 1); // the reset is itself one new row; nothing was removed
    const last = (await h.t.db.query<{ type: string; actor: string }>('select type, actor from audit_event order by seq desc limit 1')).rows[0]!;
    expect(last).toEqual({ type: 'DEMO_RESET', actor: v.actor });
    expect((await v.get('/api/audit/verify')).json()).toMatchObject({ ok: true });
  });
});

describe('GET /selfcheck', () => {
  it('proves each dependency live, without a session, and serves repeat calls from cache', async () => {
    const first = await on.inject({ method: 'GET', url: '/selfcheck' });
    expect(first.statusCode, first.body).toBe(200);
    const { probes, checkedAt } = first.json<{ probes: { name: string; ok: boolean; ms: number; detail?: string }[]; checkedAt: string }>();
    const by = Object.fromEntries(probes.map((p) => [p.name, p]));
    expect(probes.map((p) => p.name).sort()).toEqual(['channel3', 'db', 'order', 'token', 'webhook']);
    expect(by.db!.ok).toBe(true);
    expect(by.token!.ok).toBe(true);
    expect(by.order!.ok).toBe(true);
    expect(by.channel3!.ok).toBe(true);
    // The test harness registers no webhook, and the self-check says so rather than pretending.
    expect(by.webhook!.ok).toBe(false);
    expect(by.webhook!.detail).toMatch(/PAYPAL_WEBHOOK_ID/);

    const again = await on.inject({ method: 'GET', url: '/api/selfcheck' });
    expect(again.json<{ checkedAt: string }>().checkedAt).toBe(checkedAt);
    const created = Number(
      (await h.t.db.query<{ n: string }>(`select count(*) n from audit_event where entity = 'selfcheck' and payload->>'action' = 'create_order'`)).rows[0]!.n,
    );
    expect(created).toBe(1); // the second call never reached PayPal
  });

  it('reports a missing catalog key as a failed probe, not an error', async () => {
    const r = await off.inject({ method: 'GET', url: '/selfcheck' });
    expect(r.statusCode).toBe(200);
    const ch = r.json<{ probes: { name: string; ok: boolean; detail?: string }[] }>().probes.find((p) => p.name === 'channel3')!;
    expect(ch.ok).toBe(false);
    expect(ch.detail).toMatch(/Channel3/);
  });

  it('is rate limited to 6 calls a minute', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await on.inject({ method: 'GET', url: '/selfcheck' })).statusCode);
    expect(codes).toContain(429);
  });
});
