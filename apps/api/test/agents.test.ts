import { existsSync } from 'node:fs';
import { MockLanguageModelV4 } from 'ai/test';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { modelFromEnv } from '@aegis/agents';
import type { Channel3Config, LanguageModel } from '@aegis/agents';
import { listAuditForEntity, setMandateStatus, withTx } from '@aegis/db';
import type { JobSender } from '@aegis/jobs';
import { startHarness } from '../../../packages/payments/test/harness.ts';
import type { Harness } from '../../../packages/payments/test/harness.ts';
import { buildApp } from '../src/app.ts';

/**
 * The agent routes against real Postgres and the PayPal contract double. The language model is the REAL hosted model
 * whenever a key is configured (ANTHROPIC_API_KEY or GROQ_API_KEY, from the environment or the gitignored .env); the
 * AI SDK's scripted mock is used only when there is no key at all (a fresh clone, CI). The catalog is a real Channel3
 * client whose HTTP call returns a Channel3-shaped body, so the numbers the gate judges are fixed: the routes, the
 * gatekeeper, the snapshot hashing, the audit chain and the order flow that follows are all real. Assertions hold for
 * ANY valid model answer. (Live catalog checks are in packages/agents: `pnpm test:sandbox`.)
 */
if (existsSync('.env')) process.loadEnvFile('.env');
const liveModel: LanguageModel | null = modelFromEnv({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  AEGIS_LLM_MODEL: process.env.AEGIS_LLM_MODEL,
});

let h: Harness;
let app: FastifyInstance; // model + catalog configured
let bare: FastifyInstance; // neither configured
const SECRET = 'test-session-secret-0123456789abcdef';
const noJobs = { send: async () => Promise.reject(new Error('the agent routes must not queue jobs')) } as unknown as JobSender;

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function scripted(reply: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(reply) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

const offer = (domain: string, price: number, over: Record<string, unknown> = {}) => ({
  url: `https://${domain}/item`,
  domain,
  price: { price, currency: 'USD' },
  availability: 'InStock',
  condition: 'new',
  ...over,
});
const product = (id: string, title: string, offers: unknown[], rating = 4.6) => ({
  id,
  title,
  key_features: ['Double wall'],
  ratings: { value: rating, count: 120 },
  offers,
});

const CATALOG = {
  products: [
    product('p-good', 'Steel bottle 750 ml', [offer('shop-a.example', 12.5)]),
    product('p-pricey', 'Steel bottle deluxe', [offer('shop-b.example', 24)]), // above the 18.00 ceiling: R3
    product('p-out', 'Steel bottle slim', [offer('shop-c.example', 11, { availability: 'OutOfStock' })]), // R10
    product('p-low', 'Steel bottle basic', [offer('shop-d.example', 10)], 3.1), // under the minimum rating: R9
    product('p-eur', 'Steel bottle euro', [offer('shop-e.example', 9, { price: { price: 9, currency: 'EUR' } })]), // dropped
  ],
  next_page_token: null,
};

const sent: { url: string; body: Record<string, any>; apiKey: string | undefined }[] = [];
const catalog: Channel3Config = {
  apiKey: 'test-channel3-key',
  baseUrl: 'http://127.0.0.1:1',
  fetchImpl: (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)), apiKey: (init.headers as Record<string, string>)['x-api-key'] });
    return new Response(JSON.stringify(CATALOG), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch,
};

const goodParse = (deliverBy: string) => ({
  keywords: ['steel water bottle'],
  mustInclude: [],
  mustExclude: [],
  quantity: 12,
  unitCeilingUsd: '18.50',
  budgetUsd: '200',
  deliverBy,
  minRating: 4,
  allowedDomains: [],
});

const make = (extra: { model?: LanguageModel | null; channel3?: Channel3Config | null }) =>
  buildApp({
    deps: { db: h.t.db, ctx: h.ctx, clock: h.clock, jobs: noJobs, appUrl: 'https://aegispay.example', ...extra },
    sessionSecret: SECRET,
    secureCookies: false,
    judgeMode: true,
    paypalClientId: 'public-client-id',
    heartbeatMs: 200,
    rateLimitMax: 10_000,
  });

beforeAll(async () => {
  h = await startHarness();
  app = await make({ model: liveModel ?? scripted(goodParse(inDays(20))), channel3: catalog });
  bare = await make({});
});
afterAll(async () => {
  await app.close();
  await bare.close();
  await h.close();
});

async function visitor(target: FastifyInstance) {
  const r = await target.inject({ method: 'GET', url: '/api/session' });
  const cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const { csrfToken, actor } = r.json<{ csrfToken: string; actor: string }>();
  const post = (url: string, body?: unknown) =>
    target.inject({ method: 'POST', url, headers: { cookie, 'x-csrf-token': csrfToken }, ...(body === undefined ? {} : { payload: body as object }) });
  return { actor, post };
}
const errorOf = (r: { json: <T>() => T }) => r.json<{ error: { code: string; message: string } }>().error;

const draft = (over: Record<string, unknown> = {}) => ({
  spec: { keywords: ['steel water bottle'] },
  quantity: 10,
  unitCeiling: '1800',
  budget: '200000',
  currency: 'USD',
  deliverBy: inDays(20),
  minRating: 4,
  ...over,
});
async function newMandate(v: Awaited<ReturnType<typeof visitor>>, over: Record<string, unknown> = {}) {
  const r = await v.post('/api/mandates', { draft: draft(over) });
  expect(r.statusCode, r.body).toBe(201);
  return r.json<{ mandate: { id: string; version: number } }>().mandate;
}

describe('POST /api/mandates/parse', () => {
  it('turns free text into a draft the owner reviews, and saves nothing', async () => {
    const v = await visitor(app);
    const before = (await h.t.db.query<{ n: string }>('select count(*) n from mandate')).rows[0]!.n;
    const text = `Buy 12 steel water bottles, max $18.50 each, $200 total, by ${inDays(20)}, rating 4 or better.`;
    const r = await v.post('/api/mandates/parse', { text });
    expect(r.statusCode, r.body).toBe(200);
    const body = r.json<{ draft: Record<string, unknown>; warnings: string[]; step: { promptSha: string } }>();
    expect(body.draft).toMatchObject({ quantity: 12, unitCeiling: '1850', budget: '20000', currency: 'USD', deliverBy: inDays(20), minRating: 4 });
    expect(body.warnings).toEqual([]);
    expect(body.step.promptSha).toMatch(/^[0-9a-f]{16}$/);
    expect((await h.t.db.query<{ n: string }>('select count(*) n from mandate')).rows[0]!.n).toBe(before);

    // The reviewed draft is accepted by the ordinary create route, which is where it becomes a signed mandate.
    const saved = await v.post('/api/mandates', { draft: body.draft, sourceText: text });
    expect(saved.statusCode, saved.body).toBe(201);
  });

  it('answers 503 AGENT_UNAVAILABLE with no model configured, and 400 for text that is too short', async () => {
    const none = await (await visitor(bare)).post('/api/mandates/parse', { text: 'Buy 12 steel water bottles please' });
    expect(none.statusCode).toBe(503);
    expect(errorOf(none).code).toBe('AGENT_UNAVAILABLE');
    const short = await (await visitor(app)).post('/api/mandates/parse', { text: 'hi' });
    expect(short.statusCode).toBe(400);
  });
});

describe('POST /api/mandates/:id/source', () => {
  it('shortlists live-shaped offers, lets the gatekeeper judge each, stores the snapshot and audits the agent', async () => {
    const v = await visitor(app);
    const m = await newMandate(v);
    sent.length = 0;
    const r = await v.post(`/api/mandates/${m.id}/source`, {});
    expect(r.statusCode, r.body).toBe(201);
    const body = r.json<{
      query: string;
      passed: number;
      proposals: { id: string; productId: string; gatePass: boolean; decisionSha256: string; snapshotId: string; eta: string; rationale: string; gateResults: { id: string; pass: boolean }[]; unitPriceMinor: string }[];
    }>();

    // The catalog was asked for exactly what the mandate allows: the per-unit ceiling in dollars, in-stock new items.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ query: 'steel water bottle', filters: { price: { max_price: 18 }, availability: ['InStock'], conditions: ['new'] } });
    expect(sent[0]!.apiKey).toBe('test-channel3-key');

    // EUR offer dropped; the four USD offers each got a verdict from the gatekeeper, not from the model.
    expect(body.proposals.map((p) => p.productId).sort()).toEqual(['p-good', 'p-low', 'p-out', 'p-pricey']);
    expect(body.passed).toBe(1);
    const failed = (id: string) => body.proposals.find((p) => p.productId === id)!.gateResults.filter((x) => !x.pass).map((x) => x.id);
    const good = body.proposals.find((p) => p.productId === 'p-good')!;
    expect(good.gatePass).toBe(true);
    expect(good.unitPriceMinor).toBe('1250');
    expect(failed('p-pricey')).toContain('R3');
    expect(failed('p-out')).toContain('R10');
    expect(failed('p-low')).toContain('R9');
    expect(good.decisionSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(good.eta).toBe(inDays(7)); // the default supplier profile's simulated lead time, maximum
    expect(good.rationale).toMatch(/simulated lead time/);
    expect(good.rationale).toMatch(/Shipping and tax are not in the catalog data/);

    // The snapshot is stored exactly as the catalog returned it, and its fingerprint is what the gate saw.
    const snap = (await h.t.db.query<{ response: { source: string; product: { id: string } }; sha256: string }>('select response, sha256 from catalog_snapshot where id = $1', [good.snapshotId])).rows[0]!;
    expect(snap.response).toMatchObject({ source: 'channel3', productId: 'p-good', product: { id: 'p-good' } });
    expect(snap.sha256).toMatch(/^[0-9a-f]{64}$/);

    // One audit row per proposal, written by the agent, in the same transaction as the proposal.
    const events = await listAuditForEntity(h.t.db, good.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: 'agent:sourcing', type: 'PROPOSAL_GATED' });
    expect(events[0]!.payload).toMatchObject({ pass: true, requestedBy: v.actor });

    // A passing proposal goes straight into the real order flow: the hold is built from the stored, gated rows.
    const order = await v.post(`/api/proposals/${good.id}/orders`, { decisionSha256: good.decisionSha256 });
    expect(order.statusCode, order.body).toBe(201);
  });

  it('fails the proposals the supplier cannot deliver in time (R7), whatever the model would say', async () => {
    const v = await visitor(app);
    const m = await newMandate(v, { deliverBy: inDays(3) }); // default lead time is 3 to 7 days: the latest ETA is day 7
    const r = await v.post(`/api/mandates/${m.id}/source`, {});
    expect(r.statusCode, r.body).toBe(201);
    const body = r.json<{ passed: number; proposals: { gatePass: boolean; gateResults: { id: string; pass: boolean }[] }[] }>();
    expect(body.passed).toBe(0);
    for (const p of body.proposals) expect(p.gateResults.find((x) => x.id === 'R7')!.pass).toBe(false);
  });

  it('refuses without a catalog (503), for an unknown mandate (404) and for a paused mandate', async () => {
    const v = await visitor(app);
    const m = await newMandate(v);

    const none = await (await visitor(bare)).post(`/api/mandates/${m.id}/source`, {});
    expect(none.statusCode).toBe(503);
    expect(errorOf(none).code).toBe('AGENT_UNAVAILABLE');

    const unknown = await v.post('/api/mandates/018f0000-0000-7000-8000-000000000000/source', {});
    expect(unknown.statusCode).toBe(404);

    await withTx((tx) => setMandateStatus(tx, m.id, 'PAUSED', 'user:test'), h.t.db);
    sent.length = 0;
    const paused = await v.post(`/api/mandates/${m.id}/source`, {});
    expect(errorOf(paused).code).toBe('MANDATE_NOT_ACTIVE');
    expect(sent).toHaveLength(0); // it did not even search
  });
});
