import { ApiError } from '@paypal/paypal-server-sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { verifyChain } from '@aegis/db';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { MAX_401_RETRIES, RETRY_429_MS, RETRY_5XX_MS, describeFailure, paypalCall } from '../src/call.ts';
import type { SdkResponse } from '../src/call.ts';
import { paypalRequestId } from '../src/request-id.ts';

let t: TestDb;
beforeAll(async () => {
  t = await freshDb();
});
afterAll(async () => {
  await t.drop();
});

/** A real SDK ApiError, built exactly as @apimatic/core builds it from an HTTP response. */
function apiError(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
  const e = new ApiError(
    {
      request: { method: 'POST', url: 'https://api-m.sandbox.paypal.com/x', headers: {} },
      response: { statusCode, headers, body: JSON.stringify(body) },
    } as never,
    `HTTP ${statusCode}`,
  );
  e.result = body as never;
  return e;
}
const ok = <T>(result: T, headers: Record<string, string> = { 'paypal-debug-id': 'dbg-ok' }): SdkResponse<T> => ({ result, statusCode: 201, headers });

/** Sleep recorder + deterministic jitter (random 0.5 => factor exactly 1.0). */
function harness(enabled = true) {
  const sleeps: number[] = [];
  return {
    sleeps,
    deps: { writesEnabled: () => enabled, sleep: async (ms: number) => void sleeps.push(ms), random: () => 0.5 },
  };
}

/** run() that plays back a script of outcomes (an Error is thrown, anything else is returned). */
function scripted<T>(script: Array<Error | SdkResponse<T>>) {
  const seenRequestIds: string[] = [];
  let i = 0;
  const run = async ({ requestId }: { requestId: string }) => {
    seenRequestIds.push(requestId);
    const step = script[Math.min(i++, script.length - 1)]!;
    if (step instanceof Error) throw step;
    return step;
  };
  return { run, seenRequestIds, calls: () => i };
}

let orderRowId: string;
let n = 0;
beforeEach(() => {
  orderRowId = `order-${++n}`;
});

const auditFor = async (id: string) =>
  (
    await t.db.query(
      `select type, actor, entity, entity_id, paypal_request_id, paypal_debug_id, payload
         from audit_event where entity_id = $1 order by seq`,
      [id],
    )
  ).rows;

describe('kill switch', () => {
  it('refuses a write with WRITES_DISABLED before run() is ever called, and records the refusal', async () => {
    const h = harness(false);
    const s = scripted([ok({ id: 'X' })]);
    const err = await paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({ code: 'WRITES_DISABLED' });
    expect(s.calls()).toBe(0);
    const rows = await auditFor(orderRowId);
    expect(rows.map((r) => r.type)).toEqual(['PAYPAL_CALL_BLOCKED']);
    expect(rows[0].payload).toEqual({ action: 'capture', reason: 'WRITES_DISABLED' });
  });

  it('does not gate reads', async () => {
    const s = scripted([ok({ id: 'X' })]);
    const r = await paypalCall({ db: t.db, action: 'capture', orderRowId, write: false, run: s.run, deps: harness(false).deps });
    expect(r.result).toEqual({ id: 'X' });
  });

  it('takes effect immediately when the switch flips between calls', async () => {
    let on = false;
    const deps = { ...harness().deps, writesEnabled: () => on };
    const s = scripted([ok({ id: 'X' })]);
    await expect(paypalCall({ db: t.db, action: 'void', orderRowId, run: s.run, deps })).rejects.toMatchObject({ code: 'WRITES_DISABLED' });
    on = true;
    await expect(paypalCall({ db: t.db, action: 'void', orderRowId, run: s.run, deps })).resolves.toMatchObject({ statusCode: 201 });
  });
});

describe('success path', () => {
  it('sends the deterministic request id, returns the result and records one audit row with request and debug ids', async () => {
    const h = harness();
    const s = scripted([ok({ id: 'CAP-1', status: 'COMPLETED' })]);
    const r = await paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps });
    const expectedId = paypalRequestId(orderRowId, 'capture', 1);
    expect(s.seenRequestIds).toEqual([expectedId]);
    expect(r).toMatchObject({ result: { id: 'CAP-1' }, statusCode: 201, requestId: expectedId, debugId: 'dbg-ok', attempts: 1 });
    const rows = await auditFor(orderRowId);
    expect(rows).toEqual([
      {
        type: 'PAYPAL_CALL', actor: 'system:payments', entity: 'purchase_order', entity_id: orderRowId,
        paypal_request_id: expectedId, paypal_debug_id: 'dbg-ok',
        payload: { action: 'capture', ok: true, status: 201, attempt: 1 },
      },
    ]);
    expect(h.sleeps).toEqual([]);
  });

  it('a new business attempt gets a different request id; retries inside one attempt never do', async () => {
    const h = harness();
    const a = scripted([ok({})]);
    const b = scripted([ok({})]);
    await paypalCall({ db: t.db, action: 'reauthorize', orderRowId, attempt: 1, run: a.run, deps: h.deps });
    await paypalCall({ db: t.db, action: 'reauthorize', orderRowId, attempt: 2, run: b.run, deps: h.deps });
    expect(a.seenRequestIds[0]).not.toBe(b.seenRequestIds[0]);
  });
});

describe('retry policy', () => {
  it('5xx twice then success: waits 1s then 4s, reuses the SAME request id, audits all three attempts', async () => {
    const h = harness();
    const s = scripted([
      apiError(503, { name: 'SERVICE_UNAVAILABLE', message: 'down', debug_id: 'dbg-1' }, { 'paypal-debug-id': 'dbg-1' }),
      apiError(500, { name: 'INTERNAL_SERVER_ERROR', message: 'oops' }, { 'paypal-debug-id': 'dbg-2' }),
      ok({ id: 'CAP-9' }),
    ]);
    const r = await paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps });
    expect(r.attempts).toBe(3);
    expect(h.sleeps).toEqual([1_000, 4_000]);
    expect(new Set(s.seenRequestIds).size).toBe(1);
    const rows = await auditFor(orderRowId);
    expect(rows.map((x) => [x.payload.ok, x.payload.status, x.payload.willRetryInMs ?? null])).toEqual([
      [false, 503, 1000], [false, 500, 4000], [true, 201, null],
    ]);
    expect(rows.map((x) => x.paypal_debug_id)).toEqual(['dbg-1', 'dbg-2', 'dbg-ok']);
  });

  it('persistent 5xx: 1 try + 3 retries at 1s/4s/10s, then PAYPAL_ERROR carrying debug id, name and status', async () => {
    const h = harness();
    const s = scripted([apiError(502, { name: 'BAD_GATEWAY', message: 'upstream', debug_id: 'dbg-final' })]);
    const err = (await paypalCall({ db: t.db, action: 'void', orderRowId, run: s.run, deps: h.deps }).catch((e: unknown) => e)) as DomainError;
    expect(s.calls()).toBe(1 + RETRY_5XX_MS.length);
    expect(h.sleeps).toEqual([...RETRY_5XX_MS]);
    expect(err).toMatchObject({ code: 'PAYPAL_ERROR', paypalName: 'BAD_GATEWAY', paypalDebugId: 'dbg-final' });
    expect(err.details).toMatchObject({ status: 502, attempts: 4, requestId: paypalRequestId(orderRowId, 'void', 1) });
    const rows = await auditFor(orderRowId);
    expect(rows).toHaveLength(4);
    expect(rows[3].payload.willRetryInMs).toBeNull();
  });

  it('retryAmbiguous:false: a 5xx and a network error are final on the first try (the request may have been processed)', async () => {
    for (const failure of [apiError(503, { name: 'SERVICE_UNAVAILABLE', message: 'x' }), Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })]) {
      const h = harness();
      const s = scripted([failure]);
      await expect(
        paypalCall({ db: t.db, action: 'dispute_evidence', orderRowId: `${orderRowId}-${n++}`, run: s.run, deps: h.deps, retryAmbiguous: false }),
      ).rejects.toMatchObject({ code: 'PAYPAL_ERROR' });
      expect(s.calls()).toBe(1);
      expect(h.sleeps).toEqual([]);
    }
  });

  it('retryAmbiguous:false still retries what PayPal did NOT process: 429 backs off, 401 refreshes once', async () => {
    const h = harness();
    const s429 = scripted([apiError(429, { name: 'RATE_LIMIT_REACHED', message: 'slow' }), ok({ id: 'A' })]);
    await paypalCall({ db: t.db, action: 'dispute_evidence', orderRowId: `${orderRowId}-429`, run: s429.run, deps: h.deps, retryAmbiguous: false });
    expect(s429.calls()).toBe(2);
    expect(h.sleeps).toEqual([RETRY_429_MS[0]]);

    const h2 = harness();
    let refreshed = 0;
    const s401 = scripted([apiError(401, { name: 'AUTHENTICATION_FAILURE', message: 'expired' }), ok({ id: 'B' })]);
    await paypalCall({ db: t.db, action: 'dispute_evidence', orderRowId: `${orderRowId}-401`, run: s401.run, deps: h2.deps, retryAmbiguous: false, onUnauthorized: () => void refreshed++ });
    expect(s401.calls()).toBe(2);
    expect(refreshed).toBe(1);
  });

  it('429 backs off 10s then 30s, and a third 429 is final', async () => {
    const h = harness();
    const s = scripted([apiError(429, { name: 'RATE_LIMIT_REACHED', message: 'slow down' })]);
    await expect(paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps })).rejects.toMatchObject({
      code: 'PAYPAL_ERROR', paypalName: 'RATE_LIMIT_REACHED',
    });
    expect(h.sleeps).toEqual([...RETRY_429_MS]);
    expect(s.calls()).toBe(1 + RETRY_429_MS.length);
  });

  it('401 invalidates credentials once and retries immediately; a second 401 fails loudly', async () => {
    const h = harness();
    let refreshed = 0;
    const onUnauthorized = () => void refreshed++;
    const good = scripted([apiError(401, { name: 'AUTHENTICATION_FAILURE', message: 'expired' }), ok({ id: 'A' })]);
    await paypalCall({ db: t.db, action: 'authorize', orderRowId, run: good.run, deps: h.deps, onUnauthorized });
    expect(refreshed).toBe(1);
    expect(h.sleeps).toEqual([]); // no delay on the credential retry

    refreshed = 0;
    const bad = scripted([apiError(401, { name: 'AUTHENTICATION_FAILURE', message: 'still bad' })]);
    await expect(
      paypalCall({ db: t.db, action: 'authorize', orderRowId: `${orderRowId}-b`, run: bad.run, deps: h.deps, onUnauthorized }),
    ).rejects.toMatchObject({ code: 'PAYPAL_ERROR', paypalName: 'AUTHENTICATION_FAILURE' });
    expect(refreshed).toBe(MAX_401_RETRIES);
    expect(bad.calls()).toBe(1 + MAX_401_RETRIES);
  });

  it.each([400, 403, 404, 409, 422])('a %i is final: exactly one attempt, no sleep, error name preserved', async (status) => {
    const h = harness();
    const s = scripted([apiError(status, { name: 'INSTRUMENT_DECLINED', message: 'declined', debug_id: 'dbg-4xx', details: [{ issue: 'X' }] })]);
    const err = (await paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps }).catch((e: unknown) => e)) as DomainError;
    expect(s.calls()).toBe(1);
    expect(h.sleeps).toEqual([]);
    expect(err).toMatchObject({ code: 'PAYPAL_ERROR', paypalName: 'INSTRUMENT_DECLINED', paypalDebugId: 'dbg-4xx' });
    expect(err.details).toMatchObject({ status, issues: [{ issue: 'X' }] });
  });

  it('retries a network failure (connection reset) like a 5xx, including one wrapped in cause', async () => {
    const h = harness();
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const wrapped = new Error('fetch failed', { cause: Object.assign(new Error('x'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) });
    const s = scripted([reset, wrapped, ok({ id: 'N' })]);
    const r = await paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps });
    expect(r.attempts).toBe(3);
    expect(h.sleeps).toEqual([1_000, 4_000]);
    expect((await auditFor(orderRowId))[0]!.payload).toMatchObject({ ok: false, status: null, network: true });
  });

  it('does not retry an unrecognised non-HTTP error (a bug is not a flaky network)', async () => {
    const h = harness();
    const s = scripted([new TypeError('x is not a function')]);
    await expect(paypalCall({ db: t.db, action: 'capture', orderRowId, run: s.run, deps: h.deps })).rejects.toMatchObject({ code: 'PAYPAL_ERROR' });
    expect(s.calls()).toBe(1);
  });

  it('jitter keeps each delay within ±20% of the schedule', async () => {
    for (const [random, factor] of [[0, 0.8], [0.999999, 1.2]] as const) {
      const sleeps: number[] = [];
      const s = scripted([apiError(500, { name: 'E', message: 'm' })]);
      await paypalCall({
        db: t.db, action: 'capture', orderRowId: `${orderRowId}-j${random}`, run: s.run,
        deps: { writesEnabled: () => true, sleep: async (ms) => void sleeps.push(ms), random: () => random },
      }).catch(() => undefined);
      expect(sleeps).toEqual(RETRY_5XX_MS.map((ms) => Math.round(ms * factor)));
    }
  });

  it('lets a DomainError raised inside run() through untouched, with no audit row and no retry', async () => {
    const h = harness();
    const s = scripted([new DomainError('AMOUNT_MISMATCH', 'total differs')]);
    await expect(paypalCall({ db: t.db, action: 'create_order', orderRowId, run: s.run, deps: h.deps })).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect(s.calls()).toBe(1);
    expect(await auditFor(orderRowId)).toEqual([]);
  });
});

describe('audit integrity', () => {
  it('every audit row written above links into one valid hash chain', async () => {
    const v = await verifyChain(t.db);
    expect(v.ok).toBe(true);
  });
});

describe('describeFailure', () => {
  it('reads the debug id from the header, case-insensitively, falling back to the body', () => {
    expect(describeFailure(apiError(500, { name: 'X', message: 'm' }, { 'PayPal-Debug-Id': 'H-1' })).debugId).toBe('H-1');
    expect(describeFailure(apiError(500, { name: 'X', message: 'm', debug_id: 'B-1' })).debugId).toBe('B-1');
    expect(describeFailure(apiError(500, { name: 'X', message: 'm' })).debugId).toBeUndefined();
  });

  it('parses a JSON string body when the SDK has not populated result', () => {
    const e = apiError(500, {});
    e.result = undefined;
    (e as { body: unknown }).body = JSON.stringify({ name: 'FROM_BODY', message: 'm', debug_id: 'D' });
    expect(describeFailure(e)).toMatchObject({ name: 'FROM_BODY', debugId: 'D', status: 500, network: false });
  });
});

describe('an audit failure after a successful PayPal call', () => {
  it('surfaces as an error but never re-sends the PayPal request', async () => {
    const own = await freshDb();
    try {
      await own.db.query(`alter table audit_event add constraint no_paypal_call check (type <> 'PAYPAL_CALL')`);
      const s = scripted([ok({ id: 'DONE' })]);
      const err = await paypalCall({ db: own.db, action: 'capture', orderRowId: 'o-audit-fail', run: s.run, deps: harness().deps }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: '23514' }); // the database's check violation, not a PayPal error
      expect(s.calls()).toBe(1); // exactly one PayPal call: no retry of a call that already succeeded
    } finally {
      await own.drop();
    }
  });
});
