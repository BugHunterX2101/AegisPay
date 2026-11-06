import { DomainError } from '@aegis/core';
import { appendAudit, withTx } from '@aegis/db';
import type { Db } from '@aegis/db';
import { writesEnabled } from './config.ts';
import { paypalRequestId } from './request-id.ts';
import type { PayPalAction } from './request-id.ts';

/** What the Server SDK returns on success (ApiResponse<T>). */
export interface SdkResponse<T> {
  result: T;
  statusCode: number;
  headers: Record<string, string>;
}

/** Retry schedule (TDD "Idempotency"): 5xx/network 3x at 1s/4s/10s; 429 backs off 10s/30s; 401 refreshes once. */
export const RETRY_5XX_MS = [1_000, 4_000, 10_000] as const;
export const RETRY_429_MS = [10_000, 30_000] as const;
export const MAX_401_RETRIES = 1;

export interface CallDeps {
  /** Read at call time on every invocation: flipping PAYPAL_WRITES_ENABLED takes effect immediately. */
  writesEnabled: () => boolean;
  sleep: (ms: number) => Promise<void>;
  /** [0,1). Injected so tests are deterministic. */
  random: () => number;
}

export const defaultDeps: CallDeps = {
  writesEnabled: () => writesEnabled(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
};

export interface CallOptions<T> {
  db: Db;
  action: PayPalAction;
  /** purchase_order.id the call belongs to. It is part of the idempotency key and of the audit trail. */
  orderRowId: string;
  /** Business-level attempt. Retries inside this function reuse the same request id; only a new attempt changes it. */
  attempt?: number;
  /** Writes are subject to the kill switch. Pure reads pass write:false and are neither gated nor idempotency-keyed. */
  write?: boolean;
  run: (ctx: { requestId: string }) => Promise<SdkResponse<T>>;
  /**
   * What the audit rows are filed under. Defaults to the order. Calls that do not belong to an order (webhook
   * verification, disputes) name their own subject; `orderRowId` is then just the idempotency subject.
   */
  entity?: { type: string; id: string };
  /**
   * Whether a 5xx or a network error may be retried. Those outcomes are ambiguous: the request may already have been
   * processed. Replaying is safe only when PayPal can recognise the replay (a PayPal-Request-Id on the request), so a
   * write that does not send one (e.g. dispute evidence) sets this to false and surfaces the error instead of risking
   * a duplicate. 401 (token refresh) and 429 (rate limit) mean "not processed" and are always retried. Default true.
   */
  retryAmbiguous?: boolean;
  /** Called on a 401 before the single retry: invalidate the token vault and rebuild the SDK client. */
  onUnauthorized?: () => void | Promise<void>;
  deps?: Partial<CallDeps>;
}

export interface CallResult<T> {
  result: T;
  statusCode: number;
  requestId: string;
  debugId: string | undefined;
  /** Network attempts made, including the successful one. */
  attempts: number;
}

export interface FailureInfo {
  status: number | undefined;
  debugId: string | undefined;
  name: string | undefined;
  message: string;
  network: boolean;
  issues: unknown;
}

const NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'ENETUNREACH',
  'EHOSTUNREACH', 'ERR_NETWORK', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
]);

function isNetworkError(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const x = e as { code?: unknown; name?: unknown };
    if (typeof x.code === 'string' && NETWORK_CODES.has(x.code)) return true;
    if (x.name === 'AbortError' || x.name === 'TimeoutError') return true;
  }
  return false;
}

function header(h: Record<string, string> | undefined, name: string): string | undefined {
  if (!h) return undefined;
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === name) return v;
  return undefined;
}

/** Normalise whatever the SDK / HTTP layer threw into the few facts the retry policy and audit trail need. */
export function describeFailure(err: unknown): FailureInfo {
  const e = err as {
    statusCode?: unknown; headers?: Record<string, string>; result?: unknown; message?: unknown; body?: unknown;
  };
  const status = typeof e.statusCode === 'number' ? e.statusCode : undefined;
  let result = e.result as { name?: unknown; message?: unknown; debug_id?: unknown; details?: unknown } | undefined;
  if (result === undefined && typeof e.body === 'string') {
    try {
      result = JSON.parse(e.body);
    } catch {
      /* body was not JSON */
    }
  }
  const debugId =
    header(e.headers, 'paypal-debug-id') ?? (typeof result?.debug_id === 'string' ? result.debug_id : undefined);
  return {
    status,
    debugId,
    name: typeof result?.name === 'string' ? result.name : undefined,
    message:
      typeof result?.message === 'string' ? result.message : typeof e.message === 'string' ? e.message : String(err),
    network: status === undefined && isNetworkError(err),
    issues: result?.details,
  };
}

/**
 * PayPal reports the specific cause in `details[].issue` (e.g. ORDER_NOT_APPROVED); the top-level `name` is only the
 * generic class (UNPROCESSABLE_ENTITY, INVALID_REQUEST, ...). Matches either, so callers can branch on the real cause.
 */
export function hasIssue(err: unknown, issue: string): boolean {
  if (!(err instanceof DomainError)) return false;
  if (err.paypalName === issue) return true;
  const issues = (err.details as { issues?: unknown } | undefined)?.issues;
  return Array.isArray(issues) && issues.some((i) => (i as { issue?: unknown } | null)?.issue === issue);
}

const jitter = (ms: number, random: () => number) => Math.round(ms * (0.8 + 0.4 * random()));

/**
 * The only gateway to PayPal writes. For one logical operation it:
 *  1. refuses with WRITES_DISABLED before any network call when the kill switch is off,
 *  2. derives the deterministic PayPal-Request-Id (reused by every retry),
 *  3. retries per policy (5xx/network, 429, one 401 refresh; other 4xx are final),
 *  4. captures `debug_id`, and
 *  5. appends one audit_event per attempt (actor system:payments) in its own transaction.
 *     The audit row is written after the network call, because no DB transaction may span a network call.
 */
export async function paypalCall<T>(opts: CallOptions<T>): Promise<CallResult<T>> {
  const deps: CallDeps = { ...defaultDeps, ...opts.deps };
  const write = opts.write ?? true;
  const requestId = paypalRequestId(opts.orderRowId, opts.action, opts.attempt ?? 1);
  const base = {
    actor: 'system:payments',
    entity: opts.entity?.type ?? 'purchase_order',
    entityId: opts.entity?.id ?? opts.orderRowId,
    paypalRequestId: requestId,
  };

  if (write && !deps.writesEnabled()) {
    // Best effort: the refusal itself must never be masked by an audit failure.
    await withTx(
      (tx) => appendAudit(tx, { ...base, type: 'PAYPAL_CALL_BLOCKED', payload: { action: opts.action, reason: 'WRITES_DISABLED' } }),
      opts.db,
    ).catch(() => undefined);
    throw new DomainError('WRITES_DISABLED', 'PayPal writes are disabled (PAYPAL_WRITES_ENABLED is not "true")');
  }

  let attempts = 0;
  let retries5xx = 0;
  let retries429 = 0;
  let retries401 = 0;

  for (;;) {
    attempts++;
    let res: SdkResponse<T> | undefined;
    try {
      res = await opts.run({ requestId });
    } catch (err) {
      if (err instanceof DomainError) throw err; // our own validation inside run(): not a PayPal outcome
      const f = describeFailure(err);

      let delayMs: number | undefined;
      let refreshToken = false;
      if (f.status === 401 && retries401 < MAX_401_RETRIES) {
        retries401++;
        refreshToken = true;
        delayMs = 0;
      } else if (f.status === 429 && retries429 < RETRY_429_MS.length) {
        delayMs = jitter(RETRY_429_MS[retries429++]!, deps.random);
      } else if (((f.status !== undefined && f.status >= 500) || f.network) && opts.retryAmbiguous !== false && retries5xx < RETRY_5XX_MS.length) {
        delayMs = jitter(RETRY_5XX_MS[retries5xx++]!, deps.random);
      }

      await withTx(
        (tx) =>
          appendAudit(tx, {
            ...base,
            type: 'PAYPAL_CALL',
            paypalDebugId: f.debugId,
            payload: {
              action: opts.action,
              ok: false,
              status: f.status ?? null,
              name: f.name ?? null,
              message: f.message,
              network: f.network,
              attempt: attempts,
              willRetryInMs: delayMs ?? null,
            },
          }),
        opts.db,
      );

      if (delayMs === undefined) {
        throw new DomainError('PAYPAL_ERROR', `PayPal ${opts.action} failed: ${f.name ?? f.message}`, {
          paypalDebugId: f.debugId,
          paypalName: f.name,
          details: { status: f.status ?? null, issues: f.issues ?? null, attempts, requestId },
          cause: err,
        });
      }
      if (refreshToken) await opts.onUnauthorized?.();
      if (delayMs > 0) await deps.sleep(delayMs);
      continue;
    }

    // Success. Audited outside the try: a failure to write the audit row must surface as an audit
    // failure, never be mistaken for a PayPal failure and trigger a retry of a call that already worked.
    const debugId = header(res.headers, 'paypal-debug-id');
    await withTx(
      (tx) =>
        appendAudit(tx, {
          ...base,
          type: 'PAYPAL_CALL',
          paypalDebugId: debugId,
          payload: { action: opts.action, ok: true, status: res.statusCode, attempt: attempts },
        }),
      opts.db,
    );
    return { result: res.result, statusCode: res.statusCode, requestId, debugId, attempts };
  }
}
