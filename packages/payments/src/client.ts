import { Client, Environment } from '@paypal/paypal-server-sdk';
import type { OAuthToken } from '@paypal/paypal-server-sdk';
import { DomainError, systemClock } from '@aegis/core';
import type { Clock } from '@aegis/core';
import type { Db } from '@aegis/db';
import type { CallDeps } from './call.ts';
import { assertSandboxBaseUrl, SANDBOX_BASE_URL } from './config.ts';
import type { PayPalConfig } from './config.ts';
import { REFRESH_WINDOW_MS, TokenVault } from './token-vault.ts';

export interface PayPalContext {
  db: Db;
  config: PayPalConfig;
  vault: TokenVault;
  clock: Clock;
  deps?: Partial<CallDeps>;
  /** Origin for the REST endpoints the SDK does not cover (webhooks, disputes). Same sandbox-only rule as the vault. */
  restBaseUrl: string;
  /** Lazily created; rebuilt after handleUnauthorized(). */
  sdk(): Client;
  /** 401 handling: invalidate the shared token vault and drop the SDK client (and its token cache). */
  handleUnauthorized(): void;
}

export interface CreateContextOptions {
  db: Db;
  config: PayPalConfig;
  clock?: Clock;
  deps?: Partial<CallDeps>;
  vault?: TokenVault;
  /** Defaults to config.baseUrl. Tests point it at the local PayPal-contract server while the vault uses the OAuth one. */
  restBaseUrl?: string;
  /** axios overrides passed through `unstable_httpClientOptions`. Tests install an `adapter` here. */
  sdkOverrides?: Record<string, unknown>;
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Wires the official PayPal Server SDK to our TokenVault.
 *
 * The SDK hard-codes its base URL per `Environment`, so it can only reach the real sandbox. A loopback
 * PAYPAL_BASE_URL (used for local contract servers) is therefore accepted only together with explicit
 * `sdkOverrides` (an axios adapter) that redirects the traffic; otherwise we would silently talk to the real
 * sandbox while the vault talked to loopback.
 */
export function createPayPalContext(o: CreateContextOptions): PayPalContext {
  assertSandboxBaseUrl(o.config.baseUrl);
  const restBaseUrl = o.restBaseUrl ?? o.config.baseUrl;
  assertSandboxBaseUrl(restBaseUrl);
  if (!sameOrigin(o.config.baseUrl, SANDBOX_BASE_URL) && !o.sdkOverrides) {
    throw new DomainError(
      'INTERNAL',
      'a loopback PAYPAL_BASE_URL requires sdkOverrides (an axios adapter) because the PayPal SDK cannot be pointed at another host',
    );
  }
  const clock = o.clock ?? systemClock;
  const vault =
    o.vault ??
    new TokenVault({
      clientId: o.config.clientId,
      clientSecret: o.config.clientSecret,
      baseUrl: o.config.baseUrl,
      clock,
    });

  const build = (): Client =>
    new Client({
      environment: Environment.Sandbox,
      timeout: 30_000,
      clientCredentialsAuthCredentials: {
        oAuthClientId: o.config.clientId,
        oAuthClientSecret: o.config.clientSecret,
        oAuthClockSkew: REFRESH_WINDOW_MS / 1000,
        oAuthTokenProvider: async (): Promise<OAuthToken> => {
          const t = await vault.getToken();
          return { accessToken: t.accessToken, tokenType: t.tokenType, expiry: BigInt(Math.floor(t.expiresAt / 1000)) };
        },
      },
      ...(o.sdkOverrides ? { unstable_httpClientOptions: o.sdkOverrides } : {}),
    });

  let client: Client | undefined;
  const ctx: PayPalContext = {
    db: o.db,
    config: o.config,
    vault,
    clock,
    restBaseUrl,
    ...(o.deps ? { deps: o.deps } : {}),
    sdk: () => (client ??= build()),
    handleUnauthorized: () => {
      vault.invalidate();
      client = undefined;
    },
  };
  return ctx;
}
