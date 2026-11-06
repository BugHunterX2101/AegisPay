import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DomainError } from '@aegis/core';
import { verifyChain } from '@aegis/db';
import { isSimulatedEvent, simulateEvent } from '../src/webhooks/simulate.ts';
import { verifyWebhookEvent } from '../src/webhooks/verify.ts';
import { CERT_TTL_MS, CertCache, checkCertUrl, crc32Decimal, verifyOffline } from '../src/webhooks/verify-offline.ts';
import { verifyPostback } from '../src/webhooks/verify-postback.ts';
import { OffsetClock, startHarness } from './harness.ts';
import type { Harness } from './harness.ts';
import { CERT_URL, makeCert, referenceCrc32, signWebhook } from './webhook-signing.ts';

const WEBHOOK_ID = 'WH-TEST-ID-123';
// Two real RSA-2048 certificates: `cert` is the one PayPal "signs with", `other` belongs to an attacker.
const cert = makeCert();
const other = makeCert('attacker.example');

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
  h.pp.webhook = { webhookId: WEBHOOK_ID, certPem: cert.certPem };
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.pp.seen.length = 0;
  h.pp.failures.length = 0;
  h.pp.simulated.length = 0;
  h.sleeps.length = 0;
  h.writes.enabled = true;
});

const event = (extra: object = {}) =>
  Buffer.from(JSON.stringify({ id: 'WH-EVT-1', event_type: 'PAYMENT.AUTHORIZATION.CREATED', resource: { id: 'AUTH-1' }, ...extra }), 'utf8');
const signed = (raw: Buffer, o: Parameters<typeof signWebhook>[2] = { webhookId: WEBHOOK_ID }) => signWebhook(raw, cert, o);
const without = (hdr: Record<string, string>, ...keys: string[]) => Object.fromEntries(Object.entries(hdr).filter(([k]) => !keys.includes(k)));
const certs = (pem = cert.certPem, clock = new OffsetClock()) => {
  const fetched: string[] = [];
  return { fetched, clock, cache: new CertCache(clock, async (u) => (fetched.push(u), pem)) };
};
const verifyCalls = () => h.pp.seen.filter((c) => c.path === '/v1/notifications/verify-webhook-signature');
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as DomainError).code;

describe('crc32Decimal', () => {
  it('matches the standard CRC-32 check value as an unsigned decimal', () => {
    expect(crc32Decimal(Buffer.from('123456789'))).toBe('3421780262');
  });
  it('agrees with an independent table-driven implementation, including for empty and multi-byte input', () => {
    for (const s of ['', 'a', '{"id":"WH-1"}', 'héllo wörld ✓', 'x'.repeat(5000)]) {
      expect(crc32Decimal(Buffer.from(s, 'utf8'))).toBe(String(referenceCrc32(Buffer.from(s, 'utf8'))));
    }
  });
});

describe('checkCertUrl', () => {
  it.each([
    CERT_URL,
    'https://api.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-1d93a270',
    'https://API.PayPal.com/v1/notifications/certs/CERT-1',
  ])('accepts %s', (u) => {
    expect(checkCertUrl(u)).toBeInstanceOf(URL);
  });

  it.each([
    ['plain http', 'http://api.sandbox.paypal.com/v1/notifications/certs/CERT-1'],
    ['another host', 'https://evil.example/v1/notifications/certs/CERT-1'],
    ['look-alike suffix host', 'https://api.paypal.com.evil.example/v1/notifications/certs/CERT-1'],
    ['look-alike prefix host', 'https://evilapi.paypal.com/v1/notifications/certs/CERT-1'],
    ['userinfo trick', 'https://api.paypal.com@evil.example/v1/notifications/certs/CERT-1'],
    ['credentials', 'https://user:pw@api.paypal.com/v1/notifications/certs/CERT-1'],
    ['explicit port', 'https://api.paypal.com:8443/v1/notifications/certs/CERT-1'],
    ['wrong path', 'https://api.paypal.com/v1/other/CERT-1'],
    ['empty cert id', 'https://api.paypal.com/v1/notifications/certs/'],
    ['path traversal', 'https://api.paypal.com/v1/notifications/certs/../../oauth2/token'],
    ['encoded traversal', 'https://api.paypal.com/v1/notifications/certs/%2e%2e/%2e%2e/x'],
    ['not a URL', 'not a url'],
    ['empty', ''],
  ])('refuses %s', (_name, u) => {
    expect(checkCertUrl(u)).toBeUndefined();
  });
});

describe('verifyOffline', () => {
  const run = (raw: Buffer, headers: Record<string, string | undefined>, c = certs(), webhookId = WEBHOOK_ID) =>
    verifyOffline({ raw, headers, webhookId, certs: c.cache });

  it('accepts a genuine signature over the raw bytes', async () => {
    const raw = event();
    expect(await run(raw, signed(raw))).toEqual({ ok: true });
  });

  it('rejects a body altered by one byte', async () => {
    const raw = event();
    const hdr = signed(raw);
    const tampered = Buffer.from(raw);
    tampered[tampered.length - 3] = tampered[tampered.length - 3]! ^ 0x01;
    expect(await run(tampered, hdr)).toEqual({ ok: false, reason: 'SIGNATURE_MISMATCH' });
  });

  it('signs the RAW bytes: the same JSON re-serialised with different whitespace no longer verifies', async () => {
    const raw = Buffer.from('{"id":"WH-EVT-1","event_type":"PAYMENT.AUTHORIZATION.CREATED"}');
    const hdr = signed(raw);
    const pretty = Buffer.from(JSON.stringify(JSON.parse(raw.toString()), null, 2));
    expect((await run(pretty, hdr)).ok).toBe(false);
    expect((await run(raw, hdr)).ok).toBe(true);
  });

  it('rejects a different webhook id, transmission id, transmission time, or signing key', async () => {
    const raw = event();
    expect((await run(raw, signed(raw, { webhookId: 'WH-SOMEONE-ELSE' }))).ok).toBe(false);
    const good = signed(raw);
    expect((await run(raw, { ...good, 'paypal-transmission-id': 'replayed-id' })).ok).toBe(false);
    expect((await run(raw, { ...good, 'paypal-transmission-time': '2020-01-01T00:00:00Z' })).ok).toBe(false);
    expect((await run(raw, signWebhook(raw, other, { webhookId: WEBHOOK_ID }))).ok).toBe(false);
  });

  it('rejects garbage signatures', async () => {
    const raw = event();
    const hdr = signed(raw);
    expect(await run(raw, { ...hdr, 'paypal-transmission-sig': '!!!notbase64!!!' })).toEqual({ ok: false, reason: 'SIGNATURE_MISMATCH' });
    expect(await run(raw, { ...hdr, 'paypal-transmission-sig': '=' })).toEqual({ ok: false, reason: 'SIGNATURE_NOT_BASE64' });
  });

  it('names every missing header', async () => {
    const raw = event();
    const r = await run(raw, without(signed(raw), 'paypal-transmission-sig', 'paypal-cert-url'));
    expect(r).toEqual({ ok: false, reason: 'MISSING_HEADER: paypal-transmission-sig, paypal-cert-url' });
    expect(await run(raw, { ...signed(raw), 'paypal-transmission-id': '   ' })).toEqual({ ok: false, reason: 'MISSING_HEADER: paypal-transmission-id' });
  });

  it('accepts array-valued headers the way Node delivers repeated ones (first value)', async () => {
    const raw = event();
    const arr = Object.fromEntries(Object.entries(signed(raw)).map(([k, v]) => [k, [v, 'ignored']]));
    expect(await verifyOffline({ raw, headers: arr, webhookId: WEBHOOK_ID, certs: certs().cache })).toEqual({ ok: true });
  });

  it('refuses SHA1withRSA and any other algorithm', async () => {
    const raw = event();
    expect(await run(raw, signed(raw, { webhookId: WEBHOOK_ID, authAlgo: 'SHA1withRSA' }))).toEqual({ ok: false, reason: 'AUTH_ALGO_UNSUPPORTED: SHA1withRSA' });
  });

  it('fails closed when no webhook id is configured', async () => {
    const raw = event();
    expect(await run(raw, signed(raw), certs(), '')).toEqual({ ok: false, reason: 'WEBHOOK_ID_NOT_CONFIGURED' });
  });

  it('refuses a cert URL that is not allow-listed, without fetching it', async () => {
    const raw = event();
    const c = certs();
    const r = await run(raw, signed(raw, { webhookId: WEBHOOK_ID, certUrl: 'https://evil.example/v1/notifications/certs/CERT-1' }), c);
    expect(r).toEqual({ ok: false, reason: 'CERT_URL_REJECTED' });
    expect(c.fetched).toEqual([]);
  });

  it('reports CERT_UNAVAILABLE when the fetch fails or the response is not a certificate', async () => {
    const raw = event();
    const hdr = signed(raw);
    const failing = new CertCache(new OffsetClock(), async () => {
      throw new Error('boom');
    });
    const r1 = await verifyOffline({ raw, headers: hdr, webhookId: WEBHOOK_ID, certs: failing });
    expect(r1).toEqual({ ok: false, reason: expect.stringMatching(/^CERT_UNAVAILABLE: boom/) });
    const r2 = await run(raw, hdr, certs('-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----\n'));
    expect(r2).toEqual({ ok: false, reason: expect.stringMatching(/^CERT_UNAVAILABLE:/) });
  });

  it('checks the certificate validity window against the clock', async () => {
    const raw = event();
    const hdr = signed(raw);
    const c = certs();
    const day = 86_400_000;
    const late = new OffsetClock();
    late.offsetMs = 400 * day;
    const early = new OffsetClock();
    early.offsetMs = -2 * day;
    expect(await verifyOffline({ raw, headers: hdr, webhookId: WEBHOOK_ID, certs: c.cache, clock: late })).toEqual({ ok: false, reason: 'CERT_NOT_VALID_NOW' });
    expect(await verifyOffline({ raw, headers: hdr, webhookId: WEBHOOK_ID, certs: c.cache, clock: early })).toEqual({ ok: false, reason: 'CERT_NOT_VALID_NOW' });
    expect((await verifyOffline({ raw, headers: hdr, webhookId: WEBHOOK_ID, certs: c.cache })).ok).toBe(true);
  });

  it('caches the certificate for 24 hours and refetches after that', async () => {
    const raw = event();
    const hdr = signed(raw);
    const c = certs();
    await run(raw, hdr, c);
    await run(raw, hdr, c);
    expect(c.fetched).toEqual([CERT_URL]);
    expect(c.cache.size).toBe(1);
    c.clock.offsetMs += CERT_TTL_MS - 1000;
    await run(raw, hdr, c);
    expect(c.fetched).toHaveLength(1);
    c.clock.offsetMs += 2000;
    await run(raw, hdr, c);
    expect(c.fetched).toHaveLength(2);
  });
});

describe('verifyPostback (against the PayPal-contract server)', () => {
  const post = (raw: Buffer, headers: Record<string, string | undefined>, webhookId = WEBHOOK_ID) =>
    verifyPostback(h.ctx, { eventId: 'WH-EVT-1', raw, headers, webhookId });

  it('answers SUCCESS for a genuine delivery, with a bearer token and no idempotency header', async () => {
    const raw = event();
    expect(await post(raw, signed(raw))).toEqual({ ok: true });
    const calls = verifyCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.authorization).toMatch(/^Bearer tok-/);
    expect(calls[0]!.headers['paypal-request-id']).toBeUndefined();
    expect(calls[0]!.body.webhook_id).toBe(WEBHOOK_ID);
    expect(calls[0]!.body.webhook_event.id).toBe('WH-EVT-1');
  });

  it('posts the event byte-for-byte, even with unusual spacing that a re-serialisation would change', async () => {
    const raw = Buffer.from('{ "id" :"WH-EVT-1",\n   "event_type":"PAYMENT.CAPTURE.COMPLETED",\t"resource":{"amount":{"value":"10.00"}}  }');
    expect(await post(raw, signed(raw))).toEqual({ ok: true });
  });

  it('answers FAILURE for a tampered body, a wrong signing key, or a wrong webhook id', async () => {
    const raw = event();
    const hdr = signed(raw);
    const tampered = Buffer.from(raw.toString().replace('AUTH-1', 'AUTH-2'));
    expect(await post(tampered, hdr)).toEqual({ ok: false, reason: 'VERIFICATION_STATUS: FAILURE' });
    expect(await post(raw, signWebhook(raw, other, { webhookId: WEBHOOK_ID }))).toEqual({ ok: false, reason: 'VERIFICATION_STATUS: FAILURE' });
    expect(await post(raw, hdr, 'WH-OTHER')).toEqual({ ok: false, reason: 'VERIFICATION_STATUS: FAILURE' });
  });

  it('refuses locally, without calling PayPal, for missing headers, a bad cert URL, no webhook id, or a non-JSON body', async () => {
    const raw = event();
    const hdr = signed(raw);
    expect((await post(raw, without(hdr, 'paypal-auth-algo'))).ok).toBe(false);
    expect(await post(raw, { ...hdr, 'paypal-cert-url': 'https://evil.example/v1/notifications/certs/X' })).toEqual({ ok: false, reason: 'CERT_URL_REJECTED' });
    expect(await post(raw, hdr, '')).toEqual({ ok: false, reason: 'WEBHOOK_ID_NOT_CONFIGURED' });
    const junk = Buffer.from('not json at all');
    expect(await post(junk, signed(junk))).toEqual({ ok: false, reason: 'BODY_NOT_JSON' });
    expect(verifyCalls()).toHaveLength(0);
  });

  it('works with the write kill switch off, because verification changes nothing at PayPal', async () => {
    h.writes.enabled = false;
    const raw = event();
    expect(await post(raw, signed(raw))).toEqual({ ok: true });
  });

  it('retries a transient 5xx and then succeeds', async () => {
    h.pp.failures.push({ match: /verify-webhook-signature$/, count: 2, status: 500 });
    const raw = event();
    expect(await post(raw, signed(raw))).toEqual({ ok: true });
    expect(verifyCalls()).toHaveLength(3);
    expect(h.sleeps).toEqual([1000, 4000]);
  });

  it('throws PAYPAL_ERROR (never a silent pass) when PayPal keeps failing', async () => {
    h.pp.failures.push({ match: /verify-webhook-signature$/, count: 10, status: 500 });
    const raw = event();
    expect(await code(post(raw, signed(raw)))).toBe('PAYPAL_ERROR');
    expect(verifyCalls()).toHaveLength(4);
    expect(h.sleeps).toEqual([1000, 4000, 10_000]);
  });

  it('files its calls in the audit log under the webhook event, and the chain stays valid', async () => {
    const raw = event();
    await verifyPostback(h.ctx, { eventId: 'WH-EVT-AUDITED', raw, headers: signed(raw), webhookId: WEBHOOK_ID });
    const rows = (await h.t.db.query<{ entity: string }>(`select entity from audit_event where entity_id = 'WH-EVT-AUDITED'`)).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.entity === 'webhook_event')).toBe(true);
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });
});

describe('simulateEvent', () => {
  it('asks PayPal to simulate the event and records the returned id as WEBHOOK_SIMULATED', async () => {
    const r = await simulateEvent(h.ctx, { webhookId: WEBHOOK_ID, eventType: 'PAYMENT.AUTHORIZATION.CREATED' });
    expect(r.eventId).toMatch(/^WH-SIM-\d+$/);
    expect(h.pp.simulated).toContain(r.eventId);
    const call = h.pp.seen.find((c) => c.path === '/v1/notifications/simulate-event')!;
    expect(call.body).toEqual({ webhook_id: WEBHOOK_ID, event_type: 'PAYMENT.AUTHORIZATION.CREATED' });
    expect(await isSimulatedEvent(h.t.db, r.eventId)).toBe(true);
    const row = (await h.t.db.query<{ type: string; payload: { eventType: string } }>(`select type, payload from audit_event where entity = 'webhook_event' and entity_id = $1 and type = 'WEBHOOK_SIMULATED'`, [r.eventId])).rows;
    expect(row).toHaveLength(1);
    expect(row[0]!.payload.eventType).toBe('PAYMENT.AUTHORIZATION.CREATED');
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('does not treat an unknown event id as simulated', async () => {
    expect(await isSimulatedEvent(h.t.db, 'WH-NEVER-SIMULATED')).toBe(false);
  });

  it.each(['payment.authorization.created', 'PAYMENT', '', 'PAYMENT.CAPTURE.COMPLETED; drop table', 'PAYMENT..CREATED'])(
    'rejects "%s" as an event type before calling PayPal',
    async (t) => {
      expect(await code(simulateEvent(h.ctx, { webhookId: WEBHOOK_ID, eventType: t }))).toBe('VALIDATION');
      expect(h.pp.seen).toHaveLength(0);
    },
  );

  it('requires a webhook id', async () => {
    expect(await code(simulateEvent(h.ctx, { webhookId: '', eventType: 'PAYMENT.CAPTURE.COMPLETED' }))).toBe('VALIDATION');
  });

  it('is a write, so the kill switch blocks it before any network call', async () => {
    h.writes.enabled = false;
    expect(await code(simulateEvent(h.ctx, { webhookId: WEBHOOK_ID, eventType: 'PAYMENT.CAPTURE.COMPLETED' }))).toBe('WRITES_DISABLED');
    expect(h.pp.seen).toHaveLength(0);
    expect(h.pp.simulated).toHaveLength(0);
  });
});

describe('verifyWebhookEvent', () => {
  const run = (eventId: string, raw: Buffer, headers: Record<string, string>, c = certs(), webhookId = WEBHOOK_ID) =>
    verifyWebhookEvent(h.ctx, { eventId, raw, headers, webhookId, certs: c.cache });

  it('verifies a live event by postback', async () => {
    const raw = event({ id: 'WH-LIVE-1' });
    const c = certs();
    expect(await run('WH-LIVE-1', raw, signed(raw), c)).toEqual({ method: 'POSTBACK', ok: true });
    expect(verifyCalls()).toHaveLength(1);
    expect(c.fetched).toEqual([]);
  });

  it('verifies an event from our own simulate-event call offline, never by postback', async () => {
    const { eventId } = await simulateEvent(h.ctx, { webhookId: WEBHOOK_ID, eventType: 'PAYMENT.CAPTURE.COMPLETED' });
    h.pp.seen.length = 0;
    const raw = event({ id: eventId, event_type: 'PAYMENT.CAPTURE.COMPLETED' });
    const c = certs();
    expect(await run(eventId, raw, signed(raw), c)).toEqual({ method: 'OFFLINE', ok: true });
    expect(verifyCalls()).toHaveLength(0);
    expect(c.fetched).toEqual([CERT_URL]);
  });

  it('rejects a forged live event and a forged simulated event, each on its own path', async () => {
    const live = event({ id: 'WH-LIVE-FORGED' });
    const forgedLive = await run('WH-LIVE-FORGED', Buffer.from(live.toString().replace('AUTH-1', 'AUTH-9')), signed(live));
    expect(forgedLive).toMatchObject({ method: 'FAILED', ok: false, attempted: 'POSTBACK' });

    const { eventId } = await simulateEvent(h.ctx, { webhookId: WEBHOOK_ID, eventType: 'PAYMENT.CAPTURE.COMPLETED' });
    const sim = event({ id: eventId });
    const forgedSim = await run(eventId, Buffer.from(sim.toString().replace('AUTH-1', 'AUTH-9')), signed(sim));
    expect(forgedSim).toMatchObject({ method: 'FAILED', ok: false, attempted: 'OFFLINE', reason: 'SIGNATURE_MISMATCH' });
  });

  it('cannot be talked into the weaker offline path: an attacker-signed live event still goes to PayPal and fails', async () => {
    const raw = event({ id: 'WH-LIVE-ATTACKER' });
    const hdr = signWebhook(raw, other, { webhookId: WEBHOOK_ID });
    // Offline verification against a certificate the attacker controls WOULD pass...
    const offline = await verifyOffline({ raw, headers: hdr, webhookId: WEBHOOK_ID, certs: certs(other.certPem).cache });
    expect(offline).toEqual({ ok: true });
    // ...which is exactly why the path is chosen from our own audit log and never from the request.
    const r = await run('WH-LIVE-ATTACKER', raw, hdr, certs(other.certPem));
    expect(r).toMatchObject({ method: 'FAILED', ok: false, attempted: 'POSTBACK' });
    expect(verifyCalls()).toHaveLength(1);
  });

  it('fails closed on both paths when no webhook id is configured', async () => {
    const raw = event({ id: 'WH-LIVE-2' });
    expect(await run('WH-LIVE-2', raw, signed(raw), certs(), '')).toMatchObject({ method: 'FAILED', reason: 'WEBHOOK_ID_NOT_CONFIGURED', attempted: 'POSTBACK' });
    const { eventId } = await simulateEvent(h.ctx, { webhookId: WEBHOOK_ID, eventType: 'PAYMENT.CAPTURE.COMPLETED' });
    const sim = event({ id: eventId });
    expect(await run(eventId, sim, signed(sim), certs(), '')).toMatchObject({ method: 'FAILED', reason: 'WEBHOOK_ID_NOT_CONFIGURED', attempted: 'OFFLINE' });
  });

  it('lets a PayPal outage throw so the job retries, instead of recording the event as failed', async () => {
    h.pp.failures.push({ match: /verify-webhook-signature$/, count: 10, status: 503 });
    const raw = event({ id: 'WH-LIVE-3' });
    expect(await code(run('WH-LIVE-3', raw, signed(raw)))).toBe('PAYPAL_ERROR');
  });
});
