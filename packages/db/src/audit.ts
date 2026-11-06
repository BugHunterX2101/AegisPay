import { ZERO_HASH, canonicalJson, sha256Hex } from '@aegis/core';
import type { Db, Tx } from './pool.ts';
import { getPool } from './pool.ts';

/** Every appender takes this transaction-scoped advisory lock so concurrent writers cannot fork the chain. */
export const AUDIT_LOCK_KEY = 42;
export const AUDIT_NOTIFY_CHANNEL = 'aegis';

export interface NewAuditEvent {
  actor: string;
  type: string;
  entity?: string;
  entityId?: string;
  payload: unknown;
  paypalRequestId?: string;
  paypalDebugId?: string;
}

export interface AuditRow {
  seq: bigint;
  ts: string; // microsecond-exact UTC text, exactly what was hashed
  actor: string;
  type: string;
  entity: string | null;
  entityId: string | null;
  payload: unknown;
  paypalRequestId: string | null;
  paypalDebugId: string | null;
  prevHash: string;
  hash: string;
}

/** ASCII unit separator: cannot appear in the hashed fields' normal content, so boundaries are unambiguous. */
const SEP = '\u001f';

/**
 * hash = sha256(prev_hash ‖ seq ‖ ts ‖ actor ‖ type ‖ entity ‖ entity_id ‖ paypal ids ‖ canonical_json(payload))
 *
 * This is a deliberate superset of the spec formula (prev ‖ seq ‖ ts ‖ actor ‖ type ‖ payload):
 *  - fields are separator-delimited, so a value cannot be shifted between `actor` and `type` undetected;
 *  - entity / entity_id / paypal ids are covered, so editing them breaks the chain too.
 * `ts` is hashed as microsecond UTC text because JS Date only has millisecond precision.
 */
export function auditHash(
  prevHash: string,
  row: Pick<AuditRow, 'seq' | 'ts' | 'actor' | 'type' | 'entity' | 'entityId' | 'paypalRequestId' | 'paypalDebugId' | 'payload'>,
): string {
  return sha256Hex(
    [
      prevHash,
      row.seq.toString(10),
      row.ts,
      row.actor,
      row.type,
      row.entity ?? '',
      row.entityId ?? '',
      row.paypalRequestId ?? '',
      row.paypalDebugId ?? '',
      canonicalJson(row.payload),
    ].join(SEP),
  );
}

const TS_FORMAT = `to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const TS_OUT = `to_char(ts at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * Append one event to the hash chain. MUST run inside the same transaction as the state change it
 * records, so the audit row and the change commit or roll back together. Also emits
 * pg_notify('aegis', seq) in that transaction, so SSE listeners only ever see committed events.
 */
export async function appendAudit(tx: Tx, e: NewAuditEvent): Promise<{ seq: bigint; hash: string }> {
  await tx.query('select pg_advisory_xact_lock($1)', [AUDIT_LOCK_KEY]);
  const head = await tx.query<{ seq: bigint; hash: string }>(
    'select seq, hash from audit_event order by seq desc limit 1',
  );
  const prevHash = head.rows[0]?.hash ?? ZERO_HASH;
  const seq = (head.rows[0]?.seq ?? 0n) + 1n; // gap-free: possible because the lock serialises appenders
  const ts = (await tx.query<{ ts: string }>(`select ${TS_FORMAT} as ts`)).rows[0]!.ts;

  const row = {
    seq,
    ts,
    actor: e.actor,
    type: e.type,
    entity: e.entity ?? null,
    entityId: e.entityId ?? null,
    paypalRequestId: e.paypalRequestId ?? null,
    paypalDebugId: e.paypalDebugId ?? null,
    payload: e.payload,
  };
  const hash = auditHash(prevHash, row);

  await tx.query(
    `insert into audit_event
       (seq, ts, actor, type, entity, entity_id, payload, paypal_request_id, paypal_debug_id, prev_hash, hash)
     values ($1, $2::timestamptz, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
    [
      seq,
      ts,
      row.actor,
      row.type,
      row.entity,
      row.entityId,
      canonicalJson(row.payload), // stored exactly as hashed
      row.paypalRequestId,
      row.paypalDebugId,
      prevHash,
      hash,
    ],
  );
  await tx.query('select pg_notify($1, $2)', [AUDIT_NOTIFY_CHANNEL, seq.toString(10)]);
  return { seq, hash };
}

export type ChainResult =
  | { ok: true; head: string; count: bigint }
  | { ok: false; firstBadSeq: bigint; reason: 'SEQ_GAP' | 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' };

const PAGE = 1000;

/**
 * Recompute the whole chain with a keyset-paged scan (constant memory) and report the first bad row.
 * Checks, in order per row: seq is contiguous from 1, prev_hash equals the previous row's hash
 * (zeros for the first), and the stored hash equals the recomputed one.
 */
export async function verifyChain(db: Db = getPool()): Promise<ChainResult> {
  let after = 0n;
  let prev = ZERO_HASH;
  let expectedSeq = 1n;
  let count = 0n;
  for (;;) {
    const page = await db.query<{
      seq: bigint; ts: string; actor: string; type: string; entity: string | null; entity_id: string | null;
      payload: unknown; paypal_request_id: string | null; paypal_debug_id: string | null; prev_hash: string; hash: string;
    }>(
      `select seq, ${TS_OUT} as ts, actor, type, entity, entity_id, payload,
              paypal_request_id, paypal_debug_id, prev_hash, hash
         from audit_event where seq > $1 order by seq limit $2`,
      [after, PAGE],
    );
    if (page.rows.length === 0) break;
    for (const r of page.rows) {
      if (r.seq !== expectedSeq) return { ok: false, firstBadSeq: expectedSeq, reason: 'SEQ_GAP' };
      if (r.prev_hash !== prev) return { ok: false, firstBadSeq: r.seq, reason: 'PREV_HASH_MISMATCH' };
      const recomputed = auditHash(prev, {
        seq: r.seq, ts: r.ts, actor: r.actor, type: r.type, entity: r.entity, entityId: r.entity_id,
        paypalRequestId: r.paypal_request_id, paypalDebugId: r.paypal_debug_id, payload: r.payload,
      });
      if (recomputed !== r.hash) return { ok: false, firstBadSeq: r.seq, reason: 'HASH_MISMATCH' };
      prev = r.hash;
      expectedSeq += 1n;
      count += 1n;
      after = r.seq;
    }
  }
  return { ok: true, head: prev, count };
}
