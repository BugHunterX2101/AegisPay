import { DomainError } from '@aegis/core';
import { paypalCall } from './call.ts';
import type { CallResult } from './call.ts';
import type { PayPalContext } from './client.ts';
import type { PayPalAction } from './request-id.ts';

/** Thrown for a non-2xx answer. Shaped like the SDK's ApiError so `describeFailure` reads status, headers and body. */
export class PayPalHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly headers: Record<string, string>,
    readonly body: string,
  ) {
    super(`PayPal HTTP ${statusCode}`);
    this.name = 'PayPalHttpError';
  }
}

export interface RestRequest {
  method: 'GET' | 'POST';
  /** Absolute path under the sandbox origin, e.g. `/v1/customer/disputes/PP-D-1`. */
  path: string;
  query?: Record<string, string>;
  /** Serialised with JSON.stringify. */
  json?: unknown;
  /** Sent byte-for-byte (used when the exact text matters, e.g. webhook postback). */
  rawBody?: string;
  /** multipart/form-data (dispute evidence). The fetch layer sets the boundary. */
  form?: FormData;
  action: PayPalAction;
  /** What audit rows are filed under, and (with `action`) the idempotency subject. */
  subject: { type: string; id: string };
  /** Writes are subject to the kill switch. Reads and verification are not. */
  write: boolean;
  attempt?: number;
  /** Send the deterministic PayPal-Request-Id header. Only for endpoints PayPal documents as idempotent. */
  idempotent?: boolean;
}

const lower = (h: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  h.forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
};

/**
 * Typed REST call for the endpoints the Server SDK does not cover (webhook verification, simulator, disputes).
 * It goes through `paypalCall`, so it gets the same kill switch, retry policy, 401 refresh and audit trail as every
 * SDK call, and uses the same shared token vault.
 */
export async function paypalRest<T>(ctx: PayPalContext, req: RestRequest): Promise<CallResult<T>> {
  if (!req.path.startsWith('/') || req.path.includes('..')) throw new DomainError('INTERNAL', `bad REST path ${req.path}`);
  const given = [req.json !== undefined, req.rawBody !== undefined, req.form !== undefined].filter(Boolean).length;
  if (given > 1) throw new DomainError('INTERNAL', 'at most one of json / rawBody / form');

  const url = new URL(req.path, ctx.restBaseUrl);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);

  return paypalCall<T>({
    db: ctx.db,
    action: req.action,
    orderRowId: req.subject.id,
    entity: req.subject,
    write: req.write,
    ...(req.attempt ? { attempt: req.attempt } : {}),
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: async ({ requestId }) => {
      const token = await ctx.vault.getToken();
      const headers: Record<string, string> = { authorization: `${token.tokenType} ${token.accessToken}`, accept: 'application/json' };
      let body: string | FormData | undefined;
      if (req.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(req.json);
      } else if (req.rawBody !== undefined) {
        headers['content-type'] = 'application/json';
        body = req.rawBody;
      } else if (req.form) {
        body = req.form;
      }
      if (req.idempotent) headers['paypal-request-id'] = requestId;

      const res = await fetch(url, { method: req.method, headers, ...(body !== undefined ? { body } : {}), signal: AbortSignal.timeout(30_000) });
      const text = await res.text();
      const h = lower(res.headers);
      if (!res.ok) throw new PayPalHttpError(res.status, h, text);
      let result: unknown;
      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          throw new PayPalHttpError(res.status, h, text); // 2xx but not JSON: surface it, do not guess
        }
      }
      return { result: result as T, statusCode: res.status, headers: h };
    },
  });
}
