import type { Queryable, Tx } from './pool.ts';

export type WebhookVerification = 'POSTBACK' | 'OFFLINE' | 'FAILED';

export interface WebhookEventRow {
  eventId: string;
  eventType: string;
  rawBody: Buffer;
  headers: Record<string, string>;
  receivedAt: Date;
  verified: WebhookVerification | null;
  processedAt: Date | null;
  error: string | null;
  attempts: number;
}

interface WebhookDbRow {
  event_id: string; event_type: string; raw_body: Buffer; headers: Record<string, string>;
  received_at: Date; verified: WebhookVerification | null; processed_at: Date | null; error: string | null;
  attempts: number;
}

const toEvent = (r: WebhookDbRow): WebhookEventRow => ({
  eventId: r.event_id,
  eventType: r.event_type,
  rawBody: r.raw_body,
  headers: r.headers,
  receivedAt: r.received_at,
  verified: r.verified,
  processedAt: r.processed_at,
  error: r.error,
  attempts: r.attempts,
});

/** Headers that can carry credentials. They are never stored: the table is read by the dashboard and evidence. */
const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-api-key']);

/** Lower-cased, single-valued, credentials removed. Node gives repeated headers as arrays; they are joined. */
export function storableHeaders(h: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (v === undefined || SENSITIVE_HEADERS.has(key)) continue;
    out[key] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

/**
 * Persist a delivery BEFORE anything else happens to it. The exact received bytes are kept, because the signature is
 * computed over them and must be re-checkable later. `event_id` is PayPal's id and the primary key, so a redelivery
 * (PayPal retries on any non-2xx, and sometimes on 2xx) is a no-op: `inserted` is false and the caller still answers 200.
 */
export async function recordWebhookEvent(
  db: Queryable,
  e: { eventId: string; eventType: string; rawBody: Buffer; headers: Record<string, string | string[] | undefined> },
): Promise<{ inserted: boolean }> {
  const r = await db.query(
    `insert into webhook_event (event_id, event_type, raw_body, headers)
     values ($1, $2, $3, $4::jsonb)
     on conflict (event_id) do nothing`,
    [e.eventId, e.eventType, e.rawBody, JSON.stringify(storableHeaders(e.headers))],
  );
  return { inserted: r.rowCount === 1 };
}

export async function getWebhookEvent(db: Queryable, eventId: string): Promise<WebhookEventRow | null> {
  const r = await db.query<WebhookDbRow>('select * from webhook_event where event_id = $1', [eventId]);
  return r.rows[0] ? toEvent(r.rows[0]) : null;
}

/**
 * Record how (or whether) the signature was verified. Only an event that has not been processed can change: once the
 * worker has acted on it, its verification status is part of the record and stays as it was.
 */
export async function markWebhookVerified(db: Queryable, eventId: string, verified: WebhookVerification, error?: string): Promise<boolean> {
  const r = await db.query(
    'update webhook_event set verified = $2, error = $3 where event_id = $1 and processed_at is null',
    [eventId, verified, verified === 'FAILED' ? (error ?? 'signature verification failed') : null],
  );
  return r.rowCount === 1;
}

/** Take the event off the queue. `error` is set when handling failed or the event was refused. Idempotent. */
export async function markWebhookProcessed(db: Queryable, eventId: string, error?: string): Promise<boolean> {
  const r = await db.query(
    `update webhook_event set processed_at = now(), error = coalesce($2, error)
      where event_id = $1 and processed_at is null`,
    [eventId, error ?? null],
  );
  return r.rowCount === 1;
}

/**
 * Handling an event failed. Count the attempt and keep the reason. At `maxAttempts` the event is closed
 * (processed_at set) so a poison event cannot loop forever; its `error` stays for the status page and a human.
 * Only an unprocessed event changes.
 */
export async function recordWebhookFailure(
  db: Queryable,
  eventId: string,
  message: string,
  maxAttempts = 3,
): Promise<{ attempts: number; gaveUp: boolean } | null> {
  const r = await db.query<{ attempts: number; processed_at: Date | null }>(
    `update webhook_event
        set attempts = attempts + 1,
            error = $2,
            processed_at = case when attempts + 1 >= $3 then now() else null end
      where event_id = $1 and processed_at is null
      returning attempts, processed_at`,
    [eventId, message.slice(0, 2000), maxAttempts],
  );
  const row = r.rows[0];
  return row ? { attempts: row.attempts, gaveUp: row.processed_at !== null } : null;
}

/**
 * Next verified events to handle, oldest first. FOR UPDATE SKIP LOCKED lets several workers pull at once without
 * handling the same event twice or blocking on each other. Run inside the transaction that handles the event and
 * calls markWebhookProcessed, so a crash leaves it unprocessed and the next pull retries it.
 * Unverified and FAILED events are never returned: they are not trusted input.
 */
export async function claimVerifiedWebhooks(tx: Tx, limit = 10): Promise<WebhookEventRow[]> {
  const r = await tx.query<WebhookDbRow>(
    `select * from webhook_event
      where processed_at is null and verified in ('POSTBACK', 'OFFLINE')
      order by received_at, event_id
      limit $1
      for update skip locked`,
    [limit],
  );
  return r.rows.map(toEvent);
}

/** Events that arrived but were never verified (verification crashed or is pending): for the worker to re-verify. */
export async function listUnverifiedWebhooks(db: Queryable, olderThanMs = 0, limit = 50): Promise<WebhookEventRow[]> {
  const r = await db.query<WebhookDbRow>(
    `select * from webhook_event
      where processed_at is null and verified is null
        and received_at <= now() - ($1::bigint * interval '1 millisecond')
      order by received_at, event_id
      limit $2`,
    [olderThanMs, limit],
  );
  return r.rows.map(toEvent);
}
