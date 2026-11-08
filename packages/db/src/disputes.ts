import type { Queryable, Tx } from './pool.ts';

export interface DisputeLink {
  href: string;
  rel: string;
  method?: string;
}

export interface DisputeRow {
  paypalDisputeId: string;
  orderId: string | null;
  reason: string | null;
  status: string | null;
  lifeCycleStage: string | null;
  sellerResponseDue: Date | null;
  links: DisputeLink[];
  outcome: string | null;
  updatedAt: Date | null;
}

interface DisputeDbRow {
  paypal_dispute_id: string; order_id: string | null; reason: string | null; status: string | null;
  life_cycle_stage: string | null; seller_response_due: Date | null; links: DisputeLink[] | null;
  outcome: string | null; updated_at: Date | null;
}

const toDispute = (r: DisputeDbRow): DisputeRow => ({
  paypalDisputeId: r.paypal_dispute_id,
  orderId: r.order_id,
  reason: r.reason,
  status: r.status,
  lifeCycleStage: r.life_cycle_stage,
  sellerResponseDue: r.seller_response_due,
  links: r.links ?? [],
  outcome: r.outcome,
  updatedAt: r.updated_at,
});

export interface DisputeUpsert {
  paypalDisputeId: string;
  orderId: string | null;
  reason: string | null;
  status: string | null;
  lifeCycleStage: string | null;
  sellerResponseDue: Date | null;
  links: DisputeLink[];
  outcome: string | null;
}

/** Insert or refresh a dispute from PayPal's latest state. A known order link is never overwritten with null. */
export async function upsertDispute(tx: Tx, d: DisputeUpsert): Promise<DisputeRow> {
  const r = await tx.query<DisputeDbRow>(
    `insert into dispute (paypal_dispute_id, order_id, reason, status, life_cycle_stage, seller_response_due, links, outcome, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
     on conflict (paypal_dispute_id) do update set
       order_id = coalesce(excluded.order_id, dispute.order_id),
       reason = excluded.reason, status = excluded.status, life_cycle_stage = excluded.life_cycle_stage,
       seller_response_due = excluded.seller_response_due, links = excluded.links,
       outcome = excluded.outcome, updated_at = now()
     returning *`,
    [d.paypalDisputeId, d.orderId, d.reason, d.status, d.lifeCycleStage, d.sellerResponseDue, JSON.stringify(d.links), d.outcome],
  );
  return toDispute(r.rows[0]!);
}

export async function getDispute(db: Queryable, id: string): Promise<DisputeRow | null> {
  const r = await db.query<DisputeDbRow>('select * from dispute where paypal_dispute_id = $1', [id]);
  return r.rows[0] ? toDispute(r.rows[0]) : null;
}

/**
 * Disputes still in play: the order is DISPUTED (we owe an answer) or EVIDENCE_SUBMITTED (PayPal owes a verdict).
 * The worker re-fetches these so a lost webhook only delays an update.
 */
export async function listOpenDisputeIds(db: Queryable, limit = 100): Promise<string[]> {
  const r = await db.query<{ paypal_dispute_id: string }>(
    `select d.paypal_dispute_id
       from dispute d join purchase_order o on o.id = d.order_id
      where o.state in ('DISPUTED', 'EVIDENCE_SUBMITTED')
      order by d.updated_at nulls first, d.paypal_dispute_id
      limit $1`,
    [limit],
  );
  return r.rows.map((x) => x.paypal_dispute_id);
}

/** Every dispute we know of, most recently updated first. A demo has a handful; the list is capped anyway. */
export async function listDisputes(db: Queryable, limit = 100): Promise<DisputeRow[]> {
  const r = await db.query<DisputeDbRow>('select * from dispute order by updated_at desc nulls last, paypal_dispute_id limit $1', [limit]);
  return r.rows.map(toDispute);
}

/** The order whose PayPal capture is the disputed transaction (`disputed_transactions[].seller_transaction_id`). */
export async function findOrderIdByCaptureId(db: Queryable, captureId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>('select id from purchase_order where capture_id = $1', [captureId]);
  return r.rows[0]?.id ?? null;
}

export interface EvidenceFile {
  name: string;
  mime: string;
  sha256: string;
  bytes_base64: string;
}

export interface EvidenceBundleRow {
  id: string;
  disputeId: string | null;
  plan: unknown;
  inputJson: unknown;
  files: EvidenceFile[];
  sha256: string;
  reviewedBy: string | null;
  submittedAt: Date | null;
  paypalResponse: unknown;
}

interface BundleDbRow {
  id: string; dispute_id: string | null; plan: unknown; input_json: unknown; files: EvidenceFile[];
  sha256: string; reviewed_by: string | null; submitted_at: Date | null; paypal_response: unknown;
}

const toBundle = (r: BundleDbRow): EvidenceBundleRow => ({
  id: r.id,
  disputeId: r.dispute_id,
  plan: r.plan,
  inputJson: r.input_json,
  files: r.files,
  sha256: r.sha256.trim(),
  reviewedBy: r.reviewed_by,
  submittedAt: r.submitted_at,
  paypalResponse: r.paypal_response,
});

/** Stores the whole bundle (bytes and hash) before anything is sent to PayPal. */
export async function insertEvidenceBundle(
  tx: Tx,
  b: { id: string; disputeId: string; plan: unknown; inputJson: unknown; files: EvidenceFile[]; sha256: string },
): Promise<EvidenceBundleRow> {
  const r = await tx.query<BundleDbRow>(
    `insert into evidence_bundle (id, dispute_id, plan, input_json, files, sha256)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6) returning *`,
    [b.id, b.disputeId, JSON.stringify(b.plan), JSON.stringify(b.inputJson), JSON.stringify(b.files), b.sha256],
  );
  return toBundle(r.rows[0]!);
}

/** `forUpdate` (inside a transaction) serialises concurrent submitters of the same bundle on its row lock. */
export async function getEvidenceBundle(db: Queryable, id: string, opts: { forUpdate?: boolean } = {}): Promise<EvidenceBundleRow | null> {
  const r = await db.query<BundleDbRow>(`select * from evidence_bundle where id = $1 ${opts.forUpdate ? 'for update' : ''}`, [id]);
  return r.rows[0] ? toBundle(r.rows[0]) : null;
}

/** True once any bundle for this dispute has been sent to PayPal. This is what moves an order to EVIDENCE_SUBMITTED. */
export async function hasSubmittedBundle(db: Queryable, disputeId: string): Promise<boolean> {
  const r = await db.query('select 1 from evidence_bundle where dispute_id = $1 and submitted_at is not null limit 1', [disputeId]);
  return r.rows.length > 0;
}

/** Newest bundle first. There is no created_at; ids are UUIDv7, so id order is creation order. */
export async function latestEvidenceBundle(db: Queryable, disputeId: string): Promise<EvidenceBundleRow | null> {
  const r = await db.query<BundleDbRow>('select * from evidence_bundle where dispute_id = $1 order by id desc limit 1', [disputeId]);
  return r.rows[0] ? toBundle(r.rows[0]) : null;
}

/** The reviewer's confirmation. Only an unsubmitted bundle can be reviewed. */
export async function markBundleReviewed(tx: Queryable, id: string, reviewedBy: string): Promise<boolean> {
  const r = await tx.query('update evidence_bundle set reviewed_by = $2 where id = $1 and submitted_at is null', [id, reviewedBy]);
  return r.rowCount === 1;
}

/** Compare-and-set: a bundle is submitted at most once, so a retry cannot overwrite the first PayPal response. */
/**
 * The crash window between "PayPal accepted the evidence" and "we committed that fact": paypalCall writes its
 * PAYPAL_CALL audit row in its own transaction, so a successful provide-evidence call leaves an `ok:true` row filed
 * under the bundle even if the submit transaction later rolled back or the process died. Returns that row, if any.
 */
export async function acceptedEvidenceCall(
  db: Queryable,
  bundleId: string,
): Promise<{ seq: bigint; paypalRequestId: string | null; paypalDebugId: string | null } | null> {
  const r = await db.query<{ seq: bigint; paypal_request_id: string | null; paypal_debug_id: string | null }>(
    `select seq, paypal_request_id, paypal_debug_id from audit_event
      where entity = 'evidence_bundle' and entity_id = $1 and type = 'PAYPAL_CALL'
        and payload->>'action' in ('dispute_evidence', 'dispute_supporting_info') and payload->>'ok' = 'true'
      order by seq desc limit 1`,
    [bundleId],
  );
  const row = r.rows[0];
  return row ? { seq: row.seq, paypalRequestId: row.paypal_request_id, paypalDebugId: row.paypal_debug_id } : null;
}

export async function markBundleSubmitted(tx: Queryable, id: string, paypalResponse: unknown): Promise<boolean> {
  const r = await tx.query(
    `update evidence_bundle set submitted_at = now(), paypal_response = $2::jsonb where id = $1 and submitted_at is null`,
    [id, JSON.stringify(paypalResponse ?? null)],
  );
  return r.rowCount === 1;
}
