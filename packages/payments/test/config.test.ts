import { describe, expect, it } from 'vitest';
import { SANDBOX_BASE_URL, assertSandboxBaseUrl, loadPayPalConfig, writesEnabled } from '../src/config.ts';

describe('assertSandboxBaseUrl (sandbox-only guard)', () => {
  it('accepts the sandbox API and loopback hosts (for tests against a real local server)', () => {
    expect(assertSandboxBaseUrl(SANDBOX_BASE_URL)).toBe('https://api-m.sandbox.paypal.com');
    expect(assertSandboxBaseUrl('http://127.0.0.1:4010/')).toBe('http://127.0.0.1:4010');
    expect(assertSandboxBaseUrl('http://localhost:4010')).toBe('http://localhost:4010');
  });

  it.each([
    'https://api-m.paypal.com', // production
    'https://api.paypal.com',
    'http://api-m.sandbox.paypal.com', // sandbox host over plain http
    'https://api-m.sandbox.paypal.com.evil.example', // look-alike suffix
    'https://evil.example/api-m.sandbox.paypal.com', // host smuggled into the path
    'https://api-m.sandbox.paypal.com@evil.example', // userinfo trick
    'https://evil.example',
  ])('refuses %s', (url) => {
    expect(() => assertSandboxBaseUrl(url)).toThrow(/sandbox-only/);
  });

  it('refuses a malformed URL', () => {
    expect(() => assertSandboxBaseUrl('not a url')).toThrow(/not a valid URL/);
  });
});

describe('loadPayPalConfig', () => {
  it('defaults to the sandbox host and trims values', () => {
    const c = loadPayPalConfig({ PAYPAL_CLIENT_ID: ' id ', PAYPAL_CLIENT_SECRET: ' secret ', PAYPAL_WEBHOOK_ID: ' WH-1 ' });
    expect(c).toEqual({ environment: 'sandbox', clientId: 'id', clientSecret: 'secret', baseUrl: SANDBOX_BASE_URL, webhookId: 'WH-1' });
  });

  it('PAYPAL_ENVIRONMENT: sandbox (any case) or unset loads; live or anything else never does', () => {
    const base = { PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' };
    expect(loadPayPalConfig({ ...base, PAYPAL_ENVIRONMENT: 'sandbox' }).environment).toBe('sandbox');
    expect(loadPayPalConfig({ ...base, PAYPAL_ENVIRONMENT: ' Sandbox ' }).environment).toBe('sandbox');
    expect(loadPayPalConfig({ ...base, PAYPAL_ENVIRONMENT: '' }).baseUrl).toBe(SANDBOX_BASE_URL);
    expect(() => loadPayPalConfig({ ...base, PAYPAL_ENVIRONMENT: 'live' })).toThrow(/sandbox-only/);
    expect(() => loadPayPalConfig({ ...base, PAYPAL_ENVIRONMENT: 'production' })).toThrow(/sandbox-only/);
  });

  it('requires both credentials, and a production URL never loads', () => {
    expect(() => loadPayPalConfig({})).toThrow(/required/);
    expect(() => loadPayPalConfig({ PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: ' ' })).toThrow(/required/);
    expect(() =>
      loadPayPalConfig({ PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b', PAYPAL_BASE_URL: 'https://api-m.paypal.com' }),
    ).toThrow(/sandbox-only/);
  });
});

describe('writesEnabled (kill switch)', () => {
  it('is on only for the exact string "true"', () => {
    expect(writesEnabled({ PAYPAL_WRITES_ENABLED: 'true' })).toBe(true);
    for (const v of [undefined, '', 'false', '1', 'TRUE', 'True', 'yes', ' true']) {
      expect(writesEnabled({ PAYPAL_WRITES_ENABLED: v })).toBe(false);
    }
  });

  it('reads the environment at call time, not at import time', () => {
    const prev = process.env.PAYPAL_WRITES_ENABLED;
    try {
      process.env.PAYPAL_WRITES_ENABLED = 'true';
      expect(writesEnabled()).toBe(true);
      process.env.PAYPAL_WRITES_ENABLED = 'false';
      expect(writesEnabled()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PAYPAL_WRITES_ENABLED;
      else process.env.PAYPAL_WRITES_ENABLED = prev;
    }
  });
});
