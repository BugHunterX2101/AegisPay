import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { verifyChain } from '@aegis/db';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { createPayPalContext } from '../src/client.ts';
import type { PayPalContext } from '../src/client.ts';
import { SANDBOX_BASE_URL, loadPayPalConfig } from '../src/config.ts';
import { paypalRest } from '../src/rest.ts';

/**
 * LIVE contract checks against api-m.sandbox.paypal.com. Read-only: no order, authorization, capture, refund or
 * dispute is created or changed. They pin the response shapes our code depends on, so a local contract server can
 * never drift from what PayPal really sends without this file noticing.
 *
 * Credentials come from the gitignored .env. Nothing here prints a token or the secret.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const haveCreds = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

describe.skipIf(!haveCreds)('PayPal sandbox contract (live, read-only)', () => {
  let t: TestDb;
  let ctx: PayPalContext;
  /** Calls that must have left an audit row, for the audit assertions at the end. */
  let liveCalls = 0;

  beforeAll(async () => {
    t = await freshDb();
    // Force the real sandbox whatever PAYPAL_BASE_URL says, and keep the kill switch closed: this file never writes.
    const config = loadPayPalConfig({ ...process.env, PAYPAL_BASE_URL: SANDBOX_BASE_URL });
    ctx = createPayPalContext({ db: t.db, config, deps: { writesEnabled: () => false } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('OAuth client-credentials works and yields a Bearer token with a usable lifetime', async () => {
    const tok = await ctx.vault.getToken();
    expect(tok.tokenType.toLowerCase()).toBe('bearer');
    expect(tok.accessToken.length).toBeGreaterThan(20);
    const lifetimeMs = tok.expiresAt - Date.now();
    // We refresh when <15 min remain, so the real lifetime has to comfortably exceed that window.
    expect(lifetimeMs).toBeGreaterThan(30 * 60_000);
  });

  it('a second getToken reuses the cached token (one network refresh)', async () => {
    const before = ctx.vault.refreshCount;
    const a = await ctx.vault.getToken();
    const b = await ctx.vault.getToken();
    expect(b.accessToken).toBe(a.accessToken);
    expect(ctx.vault.refreshCount).toBe(before);
  });

  it('the refusal to leave the sandbox host holds against the real config', () => {
    expect(() => loadPayPalConfig({ ...process.env, PAYPAL_BASE_URL: 'https://api-m.paypal.com' })).toThrow(/sandbox-only/);
  });

  it('GET /v1/notifications/webhooks answers 200 with a webhooks array of {id,url,event_types}', async (c) => {
    let res;
    try {
      res = await paypalRest<{ webhooks?: Array<{ id: string; url: string; event_types: Array<{ name: string }> }> }>(ctx, {
        method: 'GET',
        path: '/v1/notifications/webhooks',
        action: 'get',
        subject: { type: 'sandbox_contract', id: 'webhooks_list' },
        write: false,
      });
      liveCalls++;
    } catch (err) {
      if (err instanceof DomainError && /403|NOT_AUTHORIZED|PERMISSION/i.test(`${err.message} ${err.paypalName ?? ''}`)) {
        c.skip(`sandbox app is not allowed to list webhooks: ${err.message}`);
      }
      throw err;
    }
    expect(res.statusCode).toBe(200);
    expect(res.debugId).toBeTruthy(); // PayPal always sends paypal-debug-id; our audit trail depends on it
    const hooks = res.result.webhooks ?? [];
    expect(Array.isArray(hooks)).toBe(true);
    for (const w of hooks) {
      expect(typeof w.id).toBe('string');
      expect(w.url.startsWith('https://')).toBe(true);
      expect(Array.isArray(w.event_types)).toBe(true);
    }
  });

  it('GET /v1/customer/disputes answers with the list shape our sync reads (items[].dispute_id/status)', async (c) => {
    let res;
    try {
      res = await paypalRest<{ items?: Array<{ dispute_id: string; status: string }> }>(ctx, {
        method: 'GET',
        path: '/v1/customer/disputes',
        query: { page_size: '5' },
        action: 'dispute_get',
        subject: { type: 'sandbox_contract', id: 'disputes_list' },
        write: false,
      });
      liveCalls++;
    } catch (err) {
      // 403 = the sandbox app was created without the Disputes feature. That is a finding to report, not a pass.
      if (err instanceof DomainError && /403|NOT_AUTHORIZED|PERMISSION/i.test(`${err.message} ${err.paypalName ?? ''}`)) {
        c.skip(`sandbox app cannot read disputes: ${err.message}`);
      }
      throw err;
    }
    expect(res.statusCode).toBe(200);
    expect(res.debugId).toBeTruthy();
    for (const d of res.result.items ?? []) {
      expect(d.dispute_id).toMatch(/^[A-Za-z0-9_-]+$/); // the same pattern fetchDispute enforces
      expect(typeof d.status).toBe('string');
    }
  });

  it('a rejected bearer gets a real 401 and the vault recovers by refreshing once', async () => {
    // Poison the cached token. The next real call gets a genuine 401 from PayPal, refreshes once, and retries.
    const refreshesBefore = ctx.vault.refreshCount;
    (ctx.vault as unknown as { token: unknown }).token = { accessToken: 'not-a-real-token', tokenType: 'Bearer', expiresAt: Date.now() + 3_600_000 };
    const res = await paypalRest<unknown>(ctx, {
      method: 'GET',
      path: '/v1/notifications/webhooks',
      action: 'get',
      subject: { type: 'sandbox_contract', id: 'webhooks_401' },
      write: false,
    }).catch((err: unknown) => err);
    if (res instanceof DomainError) {
      // If the app cannot list webhooks, the 401 path was still exercised before the 403; accept only that.
      expect(res.message).toMatch(/403|NOT_AUTHORIZED|PERMISSION/i);
    } else {
      expect((res as { statusCode: number }).statusCode).toBe(200);
      expect((res as { attempts: number }).attempts).toBe(2); // the 401, then the retry
    }
    expect(ctx.vault.refreshCount).toBeGreaterThan(refreshesBefore);
    liveCalls++;
  });

  it('the kill switch refuses a write against the real host without sending anything', async () => {
    const before = ctx.vault.refreshCount;
    await expect(
      paypalRest(ctx, {
        method: 'POST',
        path: '/v2/checkout/orders',
        json: {},
        action: 'create_order',
        subject: { type: 'sandbox_contract', id: 'blocked_write' },
        write: true,
      }),
    ).rejects.toMatchObject({ code: 'WRITES_DISABLED' });
    expect(ctx.vault.refreshCount).toBe(before);
  });

  it('every live call left a PAYPAL_CALL audit row carrying the debug id, and the chain still verifies', async () => {
    const { rows } = await t.db.query<{ type: string; paypal_debug_id: string | null; payload: unknown }>(
      `select type, paypal_debug_id, payload from audit_event where entity = 'sandbox_contract' order by seq`,
    );
    const calls = rows.filter((r) => r.type === 'PAYPAL_CALL');
    expect(calls.length).toBeGreaterThanOrEqual(liveCalls);
    expect(rows.some((r) => r.type === 'PAYPAL_CALL_BLOCKED')).toBe(true);
    expect(calls.some((r) => r.paypal_debug_id)).toBe(true);

    // Secrets must never reach the audit log.
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(process.env.PAYPAL_CLIENT_SECRET as string);
    expect(dump).not.toContain((await ctx.vault.getToken()).accessToken);

    const chain = await verifyChain(t.db);
    expect(chain.ok).toBe(true);
  });
});
