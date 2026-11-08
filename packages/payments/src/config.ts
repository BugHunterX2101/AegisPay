import { DomainError } from '@aegis/core';

export const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

/**
 * PAYPAL_ENVIRONMENT names the PayPal environment explicitly; the REST base URL, the browser SDK's `environment` and the
 * checkout host are all derived from it. The only value AegisPay accepts is `sandbox` (unset means sandbox): `live` or
 * anything else stops the process at start, so the switch exists without ever being able to point at real money.
 */
export type PayPalEnvironment = 'sandbox';
const BASE_URL_FOR: Record<PayPalEnvironment, string> = { sandbox: SANDBOX_BASE_URL };

export function parsePayPalEnvironment(raw: string | undefined): PayPalEnvironment {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'sandbox') return 'sandbox';
  throw new DomainError('INTERNAL', `PAYPAL_ENVIRONMENT "${raw}" refused: AegisPay is sandbox-only`);
}

export interface PayPalConfig {
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
  /** Always the sandbox host (or a loopback host in tests). Production is refused outright. */
  baseUrl: string;
  webhookId: string | undefined;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * AegisPay is sandbox-only (TDD: Environment = PayPal Sandbox). The only hosts accepted are the
 * sandbox API and loopback addresses, the latter so tests can point at a real local HTTP server.
 * `api-m.paypal.com` (production) is rejected, so a mis-set variable can never move real money.
 */
export function assertSandboxBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new DomainError('INTERNAL', `PAYPAL_BASE_URL is not a valid URL: ${raw}`);
  }
  const loopback = LOOPBACK.has(u.hostname);
  const sandbox = u.protocol === 'https:' && u.hostname === 'api-m.sandbox.paypal.com';
  if (!sandbox && !loopback) {
    throw new DomainError('INTERNAL', `PAYPAL_BASE_URL host ${u.hostname} refused: AegisPay is sandbox-only`);
  }
  return u.origin;
}

export function loadPayPalConfig(env: Record<string, string | undefined> = process.env): PayPalConfig {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new DomainError('INTERNAL', 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required');
  }
  const environment = parsePayPalEnvironment(env.PAYPAL_ENVIRONMENT);
  return {
    environment,
    clientId,
    clientSecret,
    baseUrl: assertSandboxBaseUrl(env.PAYPAL_BASE_URL?.trim() || BASE_URL_FOR[environment]),
    webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || undefined,
  };
}

/**
 * Kill switch, read at call time (never cached) so flipping the variable takes effect immediately.
 * Only the exact string 'true' enables writes: unset, empty, '1', 'TRUE' and 'yes' all mean disabled.
 */
export function writesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PAYPAL_WRITES_ENABLED === 'true';
}
