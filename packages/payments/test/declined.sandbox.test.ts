import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { hasIssue, paypalCall } from '../src/call.ts';
import { createPayPalContext } from '../src/client.ts';
import type { PayPalContext } from '../src/client.ts';
import { SANDBOX_BASE_URL, loadPayPalConfig } from '../src/config.ts';
import { BRAND_NAME } from '../src/orders.ts';
import { PayPalHttpError } from '../src/rest.ts';

/**
 * LIVE: how the real sandbox reports a declined funding source on authorize, and that our wrapper classifies it the way
 * `authorizeHold` relies on (a 422 with `details[].issue = INSTRUMENT_DECLINED`, not retried).
 *
 * PayPal's sandbox injects the decline with the `PayPal-Mock-Response` header (cardholder-name triggers do not apply to a
 * PayPal-wallet order). The Server SDK cannot send that header, so the authorize POST is made with fetch, through the same
 * `paypalCall` gateway every SDK call uses. It creates one 1.00 USD AUTHORIZE order that is never approved, so nothing is
 * held or captured. Runs only when PAYPAL_WRITES_ENABLED=true.
 */

if (existsSync('.env')) process.loadEnvFile('.env');
const haveCreds = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const writes = process.env.PAYPAL_WRITES_ENABLED === 'true';

describe.skipIf(!haveCreds || !writes)('PayPal sandbox: INSTRUMENT_DECLINED on authorize (live, one unapproved order)', () => {
  let t: TestDb;
  let ctx: PayPalContext;

  beforeAll(async () => {
    t = await freshDb();
    const config = loadPayPalConfig({ ...process.env, PAYPAL_BASE_URL: SANDBOX_BASE_URL });
    ctx = createPayPalContext({ db: t.db, config, deps: { writesEnabled: () => true } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  const post = async (path: string, requestId: string, body: unknown, extra: Record<string, string> = {}) => {
    const token = await ctx.vault.getToken();
    const res = await fetch(new URL(path, SANDBOX_BASE_URL), {
      method: 'POST',
      headers: { authorization: `${token.tokenType} ${token.accessToken}`, 'content-type': 'application/json', 'paypal-request-id': requestId, ...extra },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    if (!res.ok) throw new PayPalHttpError(res.status, headers, text);
    return { result: JSON.parse(text) as { id: string; status: string }, statusCode: res.status, headers };
  };

  it('accepts our experience_context (brand, locale, shipping preference), then reports the mocked decline as 422 INSTRUMENT_DECLINED, once', async () => {
    const subject = `declined-${Date.now()}`;
    const created = await paypalCall<{ id: string; status: string }>({
      db: t.db,
      action: 'create_order',
      orderRowId: subject,
      run: ({ requestId }) =>
        post('/v2/checkout/orders', requestId, {
          intent: 'AUTHORIZE',
          purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
          payment_source: { paypal: { experience_context: { brand_name: BRAND_NAME, locale: 'en-US', shipping_preference: 'GET_FROM_FILE', user_action: 'CONTINUE', return_url: 'https://example.com/approved', cancel_url: 'https://example.com/cancelled' } } },
        }),
    });
    expect(created.result.status).toBe('PAYER_ACTION_REQUIRED');

    let attempts = 0;
    const err = await paypalCall({
      db: t.db,
      action: 'authorize',
      orderRowId: subject,
      deps: { sleep: async () => undefined },
      run: ({ requestId }) => {
        attempts++;
        return post(`/v2/checkout/orders/${created.result.id}/authorize`, requestId, {}, { 'paypal-mock-response': JSON.stringify({ mock_application_codes: 'INSTRUMENT_DECLINED' }) });
      },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DomainError);
    const d = err as DomainError;
    expect((d.details as { status: number }).status).toBe(422);
    expect(hasIssue(d, 'INSTRUMENT_DECLINED')).toBe(true); // the exact test authorizeHold branches on
    expect(d.paypalDebugId).toBeTruthy();
    expect(attempts).toBe(1); // a 422 is final: the declined instrument is never retried
  });
});
