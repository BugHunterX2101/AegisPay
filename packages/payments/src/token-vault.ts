import { DomainError, systemClock } from '@aegis/core';
import type { Clock } from '@aegis/core';
import { z } from 'zod';

/** FR-14: refresh when fewer than 15 minutes of lifetime remain. */
export const REFRESH_WINDOW_MS = 15 * 60_000;

const tokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});

export interface Token {
  accessToken: string;
  tokenType: string;
  /** epoch ms at which PayPal will stop honouring the token */
  expiresAt: number;
}

export interface TokenVaultOptions {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  clock?: Clock;
  fetchImpl?: typeof fetch;
}

/**
 * Client-credentials token cache shared by the Server SDK (via its oAuthTokenProvider) and the thin
 * REST client (Disputes, Webhooks).
 *  - HTTP Basic auth + `grant_type=client_credentials` against POST /v1/oauth2/token.
 *  - Single-flight: concurrent callers await one in-progress refresh.
 *  - Refreshes once <15 minutes remain, so a long-running worker never sends a token about to expire.
 *  - A failed refresh is not cached: the next caller tries again.
 *  - The secret and tokens never appear in an error message or log.
 */
export class TokenVault {
  private token: Token | undefined;
  private inFlight: Promise<Token> | undefined;
  private generation = 0;
  private readonly clock: Clock;
  private readonly fetchImpl: typeof fetch;
  /** Number of network token requests made. Exposed for tests and the self-check page. */
  refreshCount = 0;

  constructor(private readonly opts: TokenVaultOptions) {
    this.clock = opts.clock ?? systemClock;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private fresh(t: Token | undefined): t is Token {
    return t !== undefined && t.expiresAt - this.clock.now().getTime() >= REFRESH_WINDOW_MS;
  }

  async getToken(): Promise<Token> {
    if (this.fresh(this.token)) return this.token;
    return this.refresh();
  }

  /** Drop the cached token (after a 401). An in-flight refresh started before this call is not reused. */
  invalidate(): void {
    this.token = undefined;
    this.generation++;
    this.inFlight = undefined;
  }

  private refresh(): Promise<Token> {
    if (this.inFlight) return this.inFlight;
    const gen = this.generation;
    const p = this.fetchToken()
      .then((t) => {
        if (gen === this.generation) this.token = t; // an invalidate() during the request wins
        return t;
      })
      .finally(() => {
        if (this.inFlight === p) this.inFlight = undefined;
      });
    this.inFlight = p;
    return p;
  }

  private async fetchToken(): Promise<Token> {
    const { clientId, clientSecret, baseUrl } = this.opts;
    this.refreshCount++;
    const startedAt = this.clock.now().getTime();
    let res: Response;
    try {
      res = await this.fetchImpl(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
      });
    } catch (err) {
      throw new DomainError('PAYPAL_ERROR', `PayPal token request failed: ${(err as Error).message}`, { cause: err });
    }
    const debugId = res.headers.get('paypal-debug-id') ?? undefined;
    const text = await res.text();
    if (!res.ok) {
      let name: string | undefined;
      try {
        name = (JSON.parse(text) as { error?: string }).error;
      } catch {
        /* non-JSON error body */
      }
      throw new DomainError('PAYPAL_ERROR', `PayPal token request returned HTTP ${res.status}${name ? ` (${name})` : ''}`, {
        paypalDebugId: debugId,
        paypalName: name,
        details: { status: res.status },
      });
    }
    let parsed: z.infer<typeof tokenResponse>;
    try {
      parsed = tokenResponse.parse(JSON.parse(text));
    } catch (err) {
      throw new DomainError('PAYPAL_ERROR', 'PayPal token response was not the expected shape', {
        paypalDebugId: debugId,
        cause: err,
      });
    }
    return {
      accessToken: parsed.access_token,
      tokenType: parsed.token_type,
      expiresAt: startedAt + parsed.expires_in * 1000,
    };
  }
}
