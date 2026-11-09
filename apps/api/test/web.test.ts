import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { JobSender } from '@aegis/jobs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness } from '../../../packages/payments/test/harness.ts';
import type { Harness } from '../../../packages/payments/test/harness.ts';
import { buildApp } from '../src/app.ts';

/**
 * The API serves the built web app as same-origin static files. A throwaway directory stands in for `pnpm build`'s
 * output; everything else (Postgres, session, rate limiter, error shape) is the real thing.
 */
let h: Harness;
let root: string;
let emptyRoot: string;
let web: FastifyInstance; // serves the web app
let limited: FastifyInstance; // serves the web app, with a tiny /api budget
let apiOnly: FastifyInstance; // no web root at all
const SECRET = 'test-session-secret-0123456789abcdef';
const noJobs = { send: async () => Promise.reject(new Error('static serving must not queue jobs')) } as unknown as JobSender;

const make = (extra: { webRoot?: string | null; rateLimitMax?: number }) =>
  buildApp({
    deps: { db: h.t.db, ctx: h.ctx, clock: h.clock, jobs: noJobs, appUrl: 'https://aegispay.example' },
    sessionSecret: SECRET,
    secureCookies: false,
    judgeMode: true,
    paypalClientId: 'public-client-id',
    heartbeatMs: 200,
    rateLimitMax: extra.rateLimitMax ?? 10_000,
    ...(extra.webRoot === undefined ? {} : { webRoot: extra.webRoot }),
  });

beforeAll(async () => {
  h = await startHarness();
  root = mkdtempSync(join(tmpdir(), 'aegis-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>AegisPay</title><div id="root"></div>');
  writeFileSync(join(root, 'assets', 'index-abc123.js'), 'console.log("aegis");');
  emptyRoot = mkdtempSync(join(tmpdir(), 'aegis-web-empty-'));
  web = await make({ webRoot: root });
  limited = await make({ webRoot: root, rateLimitMax: 2 });
  apiOnly = await make({ webRoot: emptyRoot });
});
afterAll(async () => {
  await web.close();
  await limited.close();
  await apiOnly.close();
  await h.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(emptyRoot, { recursive: true, force: true });
});

describe('static web app', () => {
  it('serves the page at / without a session, and never lets a browser cache it', async () => {
    const r = await web.inject({ method: 'GET', url: '/' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.body).toContain('<div id="root">');
  });

  it('sends the anti-framing and nosniff headers on the page itself, where framing actually matters', async () => {
    const r = await web.inject({ method: 'GET', url: '/' });
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(r.headers['cross-origin-opener-policy']).toBeUndefined(); // the PayPal popup needs window.opener
  });

  it('serves fingerprinted assets as immutable', async () => {
    const r = await web.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('javascript');
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('keeps the JSON error shape for an unknown path and for an unknown /api route', async () => {
    const s = await web.inject({ method: 'GET', url: '/api/session' });
    const cookie = s.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    for (const url of ['/nope.js', '/api/nope']) {
      const r = await web.inject({ method: 'GET', url, headers: { cookie } });
      expect(r.statusCode).toBe(404);
      expect(r.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    }
  });

  it('does not let a path climb out of the web root', async () => {
    for (const url of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/assets/../../package.json']) {
      const r = await web.inject({ method: 'GET', url });
      expect(r.statusCode).not.toBe(200);
      expect(r.body).not.toContain('"workspaces"');
    }
  });

  it('keeps the API behind its session: serving the page does not open /api', async () => {
    const r = await web.inject({ method: 'GET', url: '/api/orders' });
    expect(r.statusCode).toBe(403);
  });

  it('does not spend the visitor\'s /api rate budget on page and asset loads', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await limited.inject({ method: 'GET', url: i % 2 ? '/' : '/assets/index-abc123.js' })).statusCode).toBe(200);
    }
    const s = await limited.inject({ method: 'GET', url: '/api/session' });
    const cookie = s.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const get = () => limited.inject({ method: 'GET', url: '/api/demo/clock', headers: { cookie } });
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(429); // the /api limit itself still bites
  });

  it('is API-only when the web root has no index.html (a fresh clone before `pnpm build`)', async () => {
    const r = await apiOnly.inject({ method: 'GET', url: '/' });
    expect(r.statusCode).toBe(404);
    expect(r.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    expect((await apiOnly.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });
});
