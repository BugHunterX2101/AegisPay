import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import type { Clock } from '@aegis/core';
import { REFRESH_WINDOW_MS, TokenVault } from '../src/token-vault.ts';
import { startOAuthServer } from './oauth-server.ts';
import type { OAuthServer } from './oauth-server.ts';

const ID = 'AbC-client-id';
const SECRET = 'S3cret/with+chars=';

class MutableClock implements Clock {
  constructor(public t = Date.UTC(2026, 10, 5, 12, 0, 0)) {}
  now() { return new Date(this.t); }
  advance(ms: number) { this.t += ms; }
}

let server: OAuthServer;
let clock: MutableClock;
const vault = (over: Partial<ConstructorParameters<typeof TokenVault>[0]> = {}) =>
  new TokenVault({ clientId: ID, clientSecret: SECRET, baseUrl: server.baseUrl, clock, ...over });

beforeEach(async () => {
  clock = new MutableClock();
  server = await startOAuthServer({ clientId: ID, clientSecret: SECRET });
});
afterEach(async () => {
  await server.close();
});

describe('TokenVault', () => {
  it('requests a client-credentials token with HTTP Basic auth over the right endpoint', async () => {
    const t = await vault().getToken();
    expect(t.accessToken).toBe('tok-1');
    expect(t.tokenType).toBe('Bearer');
    expect(t.expiresAt).toBe(clock.t + 32_400_000);
    const r = server.seen[0]!;
    expect(r.method).toBe('POST');
    expect(r.url).toBe('/v1/oauth2/token');
    expect(r.headers.authorization).toBe(`Basic ${Buffer.from(`${ID}:${SECRET}`).toString('base64')}`);
    expect(r.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(r.body).toBe('grant_type=client_credentials');
  });

  it('caches while comfortably fresh', async () => {
    const v = vault();
    await v.getToken();
    clock.advance(60 * 60_000);
    expect((await v.getToken()).accessToken).toBe('tok-1');
    expect(server.issued()).toBe(1);
  });

  it('single-flight: 25 concurrent callers share one network refresh', async () => {
    server.opts.delayMs = 80;
    const v = vault();
    const tokens = await Promise.all(Array.from({ length: 25 }, () => v.getToken()));
    expect(new Set(tokens.map((t) => t.accessToken))).toEqual(new Set(['tok-1']));
    expect(server.issued()).toBe(1);
    expect(v.refreshCount).toBe(1);
  });

  it('refreshes once fewer than 15 minutes remain (boundary: exactly 15 minutes is still fresh)', async () => {
    server.opts.expiresIn = 3_600; // 60 min
    const v = vault();
    await v.getToken();
    clock.advance(3_600_000 - REFRESH_WINDOW_MS); // exactly 15 minutes left
    expect((await v.getToken()).accessToken).toBe('tok-1');
    clock.advance(1); // 15 min - 1 ms left
    expect((await v.getToken()).accessToken).toBe('tok-2');
    expect(server.issued()).toBe(2);
  });

  it('a token that lives under 15 minutes is refreshed on every use rather than served stale', async () => {
    server.opts.expiresIn = 600;
    const v = vault();
    await v.getToken();
    await v.getToken();
    expect(server.issued()).toBe(2);
  });

  it('invalidate() forces a new token', async () => {
    const v = vault();
    await v.getToken();
    v.invalidate();
    expect((await v.getToken()).accessToken).toBe('tok-2');
  });

  it('invalidate() during an in-flight refresh: that result is returned but not cached', async () => {
    server.opts.delayMs = 100;
    const v = vault();
    const first = v.getToken();
    await new Promise((r) => setTimeout(r, 20));
    v.invalidate(); // e.g. a 401 arrived for the token this refresh is replacing
    expect((await first).accessToken).toBe('tok-1');
    server.opts.delayMs = 0;
    expect((await v.getToken()).accessToken).toBe('tok-2');
  });

  it('a failed refresh is reported with the debug id and is not cached', async () => {
    server.opts.failNext = { count: 1, status: 500, body: { error: 'server_error' } };
    const v = vault();
    const err = await v.getToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({ code: 'PAYPAL_ERROR', paypalName: 'server_error', paypalDebugId: expect.stringMatching(/^dbg-/) });
    expect((await v.getToken()).accessToken).toBe('tok-1'); // next caller retries and succeeds
  });

  it('bad credentials fail with invalid_client and the secret never appears in the error', async () => {
    const v = vault({ clientSecret: 'wrong-secret-value' });
    const err = (await v.getToken().catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('PAYPAL_ERROR');
    expect(err.paypalName).toBe('invalid_client');
    const dump = JSON.stringify({ m: err.message, d: err.details, n: err.paypalName });
    expect(dump).not.toContain('wrong-secret-value');
    expect(dump).not.toContain(Buffer.from(`${ID}:wrong-secret-value`).toString('base64'));
  });

  it('rejects a 200 whose body is not a token response', async () => {
    server.opts.failNext = { count: 1, status: 200, body: { hello: 'world' } };
    await expect(vault().getToken()).rejects.toMatchObject({ code: 'PAYPAL_ERROR', message: expect.stringMatching(/expected shape/) });
  });

  it('wraps a connection failure as PAYPAL_ERROR', async () => {
    const dead = await startOAuthServer({ clientId: ID, clientSecret: SECRET });
    const url = dead.baseUrl;
    await dead.close();
    await expect(vault({ baseUrl: url }).getToken()).rejects.toMatchObject({ code: 'PAYPAL_ERROR' });
  });
});
