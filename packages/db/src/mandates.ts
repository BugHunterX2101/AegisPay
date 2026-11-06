import { DomainError, MandateDraftSchema, OPEN_STATES, canonicalJson, minorFromString, sha256Hex, systemClock } from '@aegis/core';
import type { Clock, MandateDraft, OrderState } from '@aegis/core';
import { appendAudit } from './audit.ts';
import { uuidv7 } from './ids.ts';
import type { Queryable, Tx } from './pool.ts';

export type MandateStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED';

/** A full mandate row. (`MandateRow` in proposals.ts is the narrow slice an order bundle needs.) */
export interface MandateRecord {
  id: string;
  version: number;
  status: MandateStatus;
  spec: MandateDraft['spec'];
  quantity: number;
  unitCeilingMinor: bigint;
  budgetMinor: bigint;
  currency: string;
  deliverBy: string; // 'YYYY-MM-DD'
  minRating: number | null;
  allowedDomains: string[] | null;
  approvalThresholdMinor: bigint;
  expiresAt: Date;
  sha256: string;
  createdBy: string;
  createdAt: Date;
}

interface MandateDbRow {
  id: string; version: number; status: MandateStatus; spec: MandateDraft['spec']; quantity: number;
  unit_ceiling_minor: bigint; budget_minor: bigint; currency: string; deliver_by: string;
  min_rating: string | null; allowed_domains: string[] | null; approval_threshold_minor: bigint;
  expires_at: Date; sha256: string; created_by: string; created_at: Date;
}

const toMandate = (r: MandateDbRow): MandateRecord => ({
  id: r.id,
  version: r.version,
  status: r.status,
  spec: r.spec,
  quantity: r.quantity,
  unitCeilingMinor: r.unit_ceiling_minor,
  budgetMinor: r.budget_minor,
  currency: r.currency.trim(),
  deliverBy: r.deliver_by,
  minRating: r.min_rating === null ? null : Number(r.min_rating), // numeric(2,1) arrives as text
  allowedDomains: r.allowed_domains,
  approvalThresholdMinor: r.approval_threshold_minor,
  expiresAt: r.expires_at,
  sha256: r.sha256,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/** Everything the gatekeeper's decision depends on, and nothing it does not (not status, not created_by/at). */
export type MandateDigestInput = Pick<
  MandateRecord,
  'id' | 'version' | 'spec' | 'quantity' | 'unitCeilingMinor' | 'budgetMinor' | 'currency' | 'deliverBy' |
  'minRating' | 'allowedDomains' | 'approvalThresholdMinor' | 'expiresAt'
>;

/**
 * The mandate's fingerprint: sha256 of canonical JSON over the terms. Anyone holding the row can recompute it,
 * so an edit made outside amendMandate (a new version) is detectable. Status is excluded on purpose: pausing a
 * mandate is not a change to its terms.
 */
export function mandateSha256(m: MandateDigestInput): string {
  return sha256Hex(
    canonicalJson({
      id: m.id,
      version: m.version,
      spec: m.spec,
      quantity: m.quantity,
      unitCeilingMinor: m.unitCeilingMinor,
      budgetMinor: m.budgetMinor,
      currency: m.currency,
      deliverBy: m.deliverBy,
      minRating: m.minRating,
      allowedDomains: m.allowedDomains,
      approvalThresholdMinor: m.approvalThresholdMinor,
      expiresAt: m.expiresAt,
    }),
  );
}

/** Shape-compatible with @aegis/gatekeeper's `Mandate` (db must not import gatekeeper, so it is structural). */
export function toGateMandate(m: MandateRecord) {
  return {
    id: m.id,
    version: m.version,
    sha256: m.sha256,
    spec: m.spec,
    quantity: m.quantity,
    unitCeiling: m.unitCeilingMinor,
    budget: m.budgetMinor,
    currency: 'USD' as const,
    deliverBy: m.deliverBy,
    ...(m.minRating === null ? {} : { minRating: m.minRating }),
    ...(m.allowedDomains === null ? {} : { allowedDomains: m.allowedDomains }),
    approvalThreshold: m.approvalThresholdMinor,
    expiresAt: m.expiresAt.toISOString(),
    status: m.status,
  };
}

interface Normalized {
  spec: MandateDraft['spec'];
  quantity: number;
  unitCeilingMinor: bigint;
  budgetMinor: bigint;
  currency: 'USD';
  deliverBy: string;
  minRating: number | null;
  allowedDomains: string[] | null;
  approvalThresholdMinor: bigint;
  expiresAt: Date;
}

/**
 * Re-validate a draft at the storage boundary (the API validated it already, but this module must not trust its
 * caller) and fill the documented defaults:
 *  - approvalThreshold defaults to the budget, i.e. no second approver is ever required unless one is set;
 *  - expiresAt defaults to the end of the delivery day (UTC): a mandate that outlives its delivery window has no use.
 * Rejects rather than rounds: a minRating with more than one decimal would silently change in numeric(2,1).
 */
function normalize(draftInput: unknown, now: Date): Normalized {
  const parsed = MandateDraftSchema.safeParse(draftInput);
  if (!parsed.success) throw new DomainError('MANDATE_INVALID', 'mandate draft failed validation', { details: parsed.error.issues });
  const d = parsed.data;

  const unitCeilingMinor = minorFromString(d.unitCeiling);
  const budgetMinor = minorFromString(d.budget);
  const approvalThresholdMinor = d.approvalThreshold === undefined ? budgetMinor : minorFromString(d.approvalThreshold);
  const expiresAt = new Date(d.expiresAt ?? `${d.deliverBy}T23:59:59.000Z`);
  const problems: string[] = [];

  if (budgetMinor <= 0n) problems.push('budget must be greater than zero');
  if (Number.isNaN(expiresAt.getTime())) problems.push('expiresAt is not a valid instant');
  else if (expiresAt.getTime() <= now.getTime()) problems.push('expiresAt is not in the future');
  if (d.deliverBy < now.toISOString().slice(0, 10)) problems.push('deliverBy is in the past');
  if (d.minRating !== undefined && Math.round(d.minRating * 10) / 10 !== d.minRating) problems.push('minRating allows one decimal place');
  if (problems.length > 0) throw new DomainError('MANDATE_INVALID', problems.join('; '), { details: problems });

  const domains = d.allowedDomains === undefined ? null : [...new Set(d.allowedDomains)].sort();
  return {
    spec: d.spec,
    quantity: d.quantity,
    unitCeilingMinor,
    budgetMinor,
    currency: d.currency,
    deliverBy: d.deliverBy,
    minRating: d.minRating ?? null,
    allowedDomains: domains !== null && domains.length === 0 ? null : domains,
    approvalThresholdMinor,
    expiresAt,
  };
}

async function insertVersion(
  tx: Tx, id: string, version: number, status: MandateStatus, n: Normalized, createdBy: string,
): Promise<MandateRecord> {
  const sha256 = mandateSha256({ id, version, ...n });
  const r = await tx.query<MandateDbRow>(
    `insert into mandate (id, version, status, spec, quantity, unit_ceiling_minor, budget_minor, currency, deliver_by,
                          min_rating, allowed_domains, approval_threshold_minor, expires_at, sha256, created_by)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning *`,
    [id, version, status, JSON.stringify(n.spec), n.quantity, n.unitCeilingMinor, n.budgetMinor, n.currency, n.deliverBy,
      n.minRating, n.allowedDomains, n.approvalThresholdMinor, n.expiresAt, sha256, createdBy],
  );
  return toMandate(r.rows[0]!);
}

/**
 * Serialise every change to one mandate for the rest of this transaction. A row lock on the current version is not
 * enough: amending inserts a NEW row, so a concurrent amender that was waiting on the old row wakes up, re-reads the
 * same old version, and collides on the primary key instead of seeing the new one.
 */
export async function lockMandate(tx: Tx, id: string): Promise<void> {
  await tx.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`mandate:${id}`]);
}

/** Create version 1 of a new mandate. Audited in the same transaction. */
export async function createMandate(
  tx: Tx,
  draft: unknown,
  opts: { createdBy: string; id?: string; clock?: Clock; sourceText?: string },
): Promise<MandateRecord> {
  const now = (opts.clock ?? systemClock).now();
  const n = normalize(draft, now);
  const m = await insertVersion(tx, opts.id ?? uuidv7(), 1, 'ACTIVE', n, opts.createdBy);
  await appendAudit(tx, {
    actor: opts.createdBy,
    type: 'MANDATE_CREATED',
    entity: 'mandate',
    entityId: m.id,
    payload: { version: m.version, sha256: m.sha256, budgetMinor: m.budgetMinor, quantity: m.quantity, ...(opts.sourceText === undefined ? {} : { sourceText: opts.sourceText }) },
  });
  return m;
}

export async function getMandate(db: Queryable, id: string, version: number, opts: { forUpdate?: boolean } = {}): Promise<MandateRecord | null> {
  const r = await db.query<MandateDbRow>(`select * from mandate where id = $1 and version = $2 ${opts.forUpdate ? 'for update' : ''}`, [id, version]);
  return r.rows[0] ? toMandate(r.rows[0]) : null;
}

/** The highest version: the only one a proposal may target (gate rule R2). */
export async function getCurrentMandate(db: Queryable, id: string, opts: { forUpdate?: boolean } = {}): Promise<MandateRecord | null> {
  const r = await db.query<MandateDbRow>(
    `select * from mandate where id = $1 order by version desc limit 1 ${opts.forUpdate ? 'for update' : ''}`,
    [id],
  );
  return r.rows[0] ? toMandate(r.rows[0]) : null;
}

/** Current version of every mandate, newest first. */
export async function listMandates(db: Queryable, opts: { status?: MandateStatus; limit?: number } = {}): Promise<MandateRecord[]> {
  const r = await db.query<MandateDbRow>(
    `select m.* from mandate m
      where m.version = (select max(version) from mandate where id = m.id)
        and ($1::text is null or m.status = $1)
      order by m.created_at desc, m.id desc
      limit $2`,
    [opts.status ?? null, opts.limit ?? 100],
  );
  return r.rows.map(toMandate);
}

/**
 * Change the terms: inserts version + 1 (ACTIVE) and leaves every earlier version untouched, so a proposal gated
 * against v1 still points at the exact terms it was judged on and now fails R2 until it is re-proposed.
 * Locks the current version row, so two concurrent amendments cannot both create the same version number.
 */
export async function amendMandate(
  tx: Tx,
  id: string,
  draft: unknown,
  opts: { amendedBy: string; clock?: Clock },
): Promise<MandateRecord> {
  await lockMandate(tx, id);
  const cur = await getCurrentMandate(tx, id, { forUpdate: true });
  if (!cur) throw new DomainError('NOT_FOUND', `Mandate ${id} not found`);
  if (cur.status === 'CLOSED') throw new DomainError('MANDATE_NOT_ACTIVE', `Mandate ${id} is closed and cannot be amended`);
  const n = normalize(draft, (opts.clock ?? systemClock).now());
  // The new version inherits the status: amending a PAUSED mandate must not quietly restart spending.
  const m = await insertVersion(tx, id, cur.version + 1, cur.status, n, opts.amendedBy);
  await appendAudit(tx, {
    actor: opts.amendedBy,
    type: 'MANDATE_AMENDED',
    entity: 'mandate',
    entityId: id,
    payload: { fromVersion: cur.version, toVersion: m.version, fromSha256: cur.sha256, toSha256: m.sha256 },
  });
  return m;
}

/** Pause, resume or close the CURRENT version. CLOSED is final. */
export async function setMandateStatus(tx: Tx, id: string, to: MandateStatus, actor: string): Promise<MandateRecord> {
  await lockMandate(tx, id);
  const cur = await getCurrentMandate(tx, id, { forUpdate: true });
  if (!cur) throw new DomainError('NOT_FOUND', `Mandate ${id} not found`);
  if (cur.status === to) return cur;
  if (cur.status === 'CLOSED') throw new DomainError('MANDATE_NOT_ACTIVE', `Mandate ${id} is closed and cannot be reopened`);
  const r = await tx.query<MandateDbRow>('update mandate set status = $3 where id = $1 and version = $2 returning *', [id, cur.version, to]);
  await appendAudit(tx, {
    actor,
    type: 'MANDATE_STATUS_CHANGED',
    entity: 'mandate',
    entityId: id,
    payload: { version: cur.version, from: cur.status, to },
  });
  return toMandate(r.rows[0]!);
}

/**
 * Budget already committed under this mandate (every version): orders that hold funds or have taken them.
 * AWAITING_APPROVAL counts, so two proposals cannot each be gated against the same unspent budget.
 * Not counted: GATED/REJECTED/CANCELLED/FAILED/VOIDED (no money held), REFUNDED (returned), RESOLVED_LOST (the
 * dispute went against us and the funds went back to the payer).
 * Call inside the same transaction that holds `getMandate(..., {forUpdate: true})`, so concurrent gating serialises.
 */
export const BUDGET_COMMITTED_STATES: readonly OrderState[] = [...OPEN_STATES, 'RESOLVED_WON'];

export async function spentSoFar(db: Queryable, mandateId: string): Promise<bigint> {
  const r = await db.query<{ spent: bigint }>(
    `select coalesce(sum(o.amount_minor), 0)::bigint as spent
       from purchase_order o
       join proposal p on p.id = o.proposal_id
      where p.mandate_id = $1 and o.state = any($2::text[])`,
    [mandateId, BUDGET_COMMITTED_STATES],
  );
  return r.rows[0]!.spent;
}
