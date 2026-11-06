import type { OrderState } from '@aegis/core';
import { DomainError, sha256Hex } from '@aegis/core';
import {
  appendAudit,
  findOrderIdByCaptureId,
  getDispute,
  getDisputeSources,
  getEvidenceBundle,
  getFulfillment,
  getOrder,
  hasSubmittedBundle,
  insertEvidenceBundle,
  listRefunds,
  markBundleReviewed,
  markBundleSubmitted,
  transition,
  upsertDispute,
  uuidv7,
  withTx,
} from '@aegis/db';
import type { DisputeLink, DisputeRow, DisputeSources, EvidenceBundleRow, EvidenceFile } from '@aegis/db';
import type { PayPalContext } from './client.ts';
import { paypalRest } from './rest.ts';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, bundleSha256, renderPdfs } from './evidence/pdf.ts';
import type { RenderFacts } from './evidence/pdf.ts';
import { MAX_FILES, MAX_NOTES_CHARS, buildEvidenceInput, planEvidence } from './evidence/plan.ts';
import type { EvidenceFacts, PlanResult } from './evidence/plan.ts';

/* ------------------------------------------------------------------------------------------------------------------
 * Reading a dispute from PayPal
 * ---------------------------------------------------------------------------------------------------------------- */

/** The fields of PayPal's dispute object this module acts on. Anything else PayPal sends is ignored, never guessed. */
export interface PayPalDispute {
  disputeId: string;
  reason: string | null;
  status: string | null;
  lifeCycleStage: string | null;
  sellerResponseDue: Date | null;
  links: DisputeLink[];
  /** `dispute_outcome.outcome_code`, e.g. RESOLVED_SELLER_FAVOUR. Null until PayPal decides. */
  outcomeCode: string | null;
  /** `disputed_transactions[].seller_transaction_id`: the capture ids the buyer is disputing. */
  transactionIds: string[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function parseDispute(raw: unknown, expectedId: string): PayPalDispute {
  const d = obj(raw);
  const id = d ? str(d.dispute_id) : null;
  if (!d || !id) throw new DomainError('PAYPAL_ERROR', 'PayPal returned a dispute without a dispute_id');
  if (id !== expectedId) throw new DomainError('PAYPAL_ERROR', `asked PayPal for dispute ${expectedId} and got ${id}`);

  const links: DisputeLink[] = [];
  if (Array.isArray(d.links)) {
    for (const l of d.links) {
      const o = obj(l);
      const href = o ? str(o.href) : null;
      const rel = o ? str(o.rel) : null;
      if (o && href && rel) links.push({ href, rel, ...(str(o.method) ? { method: str(o.method)! } : {}) });
    }
  }

  const txIds: string[] = [];
  if (Array.isArray(d.disputed_transactions)) {
    for (const t of d.disputed_transactions) {
      const sid = str(obj(t)?.seller_transaction_id);
      if (sid) txIds.push(sid);
    }
  }

  const dueRaw = str(d.seller_response_due_date);
  const due = dueRaw ? new Date(dueRaw) : null;

  return {
    disputeId: id,
    reason: str(d.reason),
    status: str(d.status),
    lifeCycleStage: str(d.dispute_life_cycle_stage),
    sellerResponseDue: due && !Number.isNaN(due.getTime()) ? due : null,
    links,
    outcomeCode: str(obj(d.dispute_outcome)?.outcome_code),
    transactionIds: txIds,
  };
}

/** GET /v1/customer/disputes/{id}. A read, so the kill switch does not apply. */
export async function fetchDispute(ctx: PayPalContext, disputeId: string): Promise<PayPalDispute> {
  if (!/^[A-Za-z0-9_-]+$/.test(disputeId)) throw new DomainError('VALIDATION', 'malformed dispute id');
  const res = await paypalRest<unknown>(ctx, {
    method: 'GET',
    path: `/v1/customer/disputes/${disputeId}`,
    action: 'dispute_get',
    subject: { type: 'dispute', id: disputeId },
    write: false,
  });
  return parseDispute(res.result, disputeId);
}

/** PayPal's documentation writes this rel with a hyphen, sandbox payloads have been seen with an underscore. Accept both. */
const norm = (rel: string) => rel.toLowerCase().replace(/_/g, '-');
export const hasProvideEvidenceLink = (links: readonly DisputeLink[]): boolean => links.some((l) => norm(l.rel) === 'provide-evidence');

/** The only status in which PayPal lets a seller answer. */
export const SELLER_TURN = 'WAITING_FOR_SELLER_RESPONSE';

/** PayPal's outcome codes that clearly say who won. Anything else is recorded and shown to a human, never guessed at. */
export function orderStateForOutcome(code: string | null): 'RESOLVED_WON' | 'RESOLVED_LOST' | null {
  if (code === 'RESOLVED_SELLER_FAVOUR') return 'RESOLVED_WON';
  if (code === 'RESOLVED_BUYER_FAVOUR') return 'RESOLVED_LOST';
  return null;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Sync: PayPal's state -> our dispute row -> the order's state
 * ---------------------------------------------------------------------------------------------------------------- */

export interface DisputeSync {
  dispute: DisputeRow;
  orderId: string | null;
  orderState: OrderState | null;
  /** True when PayPal's status, stage or outcome differs from what we had (or we had nothing). */
  changed: boolean;
  /** The state this sync moved the order to, if it moved it. */
  moved: OrderState | null;
}

/**
 * Pull the dispute from PayPal and bring our records in line. Safe to repeat: a second call with nothing new changes
 * nothing and writes no audit row.
 *
 * - The order is found by matching `disputed_transactions[].seller_transaction_id` to our capture id.
 * - A SETTLED order moves to DISPUTED.
 * - An order moves to RESOLVED_WON or RESOLVED_LOST only from EVIDENCE_SUBMITTED, and only when PayPal's outcome code
 *   says who won. The state machine has no edge from DISPUTED to RESOLVED_*, so a dispute that PayPal resolves before we
 *   answered leaves the order in DISPUTED with the outcome recorded and an audit row for a human.
 */
export async function syncDispute(ctx: PayPalContext, disputeId: string): Promise<DisputeSync> {
  const remote = await fetchDispute(ctx, disputeId);

  let matchedOrderId: string | null = null;
  for (const t of remote.transactionIds) {
    matchedOrderId = await findOrderIdByCaptureId(ctx.db, t);
    if (matchedOrderId) break;
  }

  return withTx(async (tx) => {
    const before = await getDispute(tx, disputeId);
    const row = await upsertDispute(tx, {
      paypalDisputeId: disputeId,
      orderId: matchedOrderId,
      reason: remote.reason,
      status: remote.status,
      lifeCycleStage: remote.lifeCycleStage,
      sellerResponseDue: remote.sellerResponseDue,
      links: remote.links,
      outcome: remote.outcomeCode,
    });

    const changed = !before || before.status !== row.status || before.lifeCycleStage !== row.lifeCycleStage || before.outcome !== row.outcome || before.orderId !== row.orderId;
    if (changed) {
      await appendAudit(tx, {
        actor: 'system:paypal',
        type: 'DISPUTE_SYNCED',
        entity: 'dispute',
        entityId: disputeId,
        payload: {
          reason: row.reason,
          status: row.status,
          lifeCycleStage: row.lifeCycleStage,
          outcome: row.outcome,
          sellerResponseDue: row.sellerResponseDue?.toISOString() ?? null,
          orderId: row.orderId,
          disputedTransactions: remote.transactionIds,
        },
      });
    }

    let orderState: OrderState | null = null;
    let moved: OrderState | null = null;

    if (row.orderId) {
      const order = await getOrder(tx, row.orderId, { forUpdate: true });
      if (order) {
        orderState = order.state;

        if (orderState === 'SETTLED') {
          const r = await transition(tx, row.orderId, ['SETTLED'], 'DISPUTED');
          if (r === 'APPLIED') {
            moved = orderState = 'DISPUTED';
            await appendAudit(tx, {
              actor: 'system:paypal',
              type: 'DISPUTE_OPENED',
              entity: 'purchase_order',
              entityId: row.orderId,
              payload: { disputeId, reason: row.reason, captureId: order.captureId },
            });
          }
        }

        const resolved = row.status === 'RESOLVED';
        if (resolved && orderState === 'EVIDENCE_SUBMITTED') {
          const target = orderStateForOutcome(row.outcome);
          if (target) {
            const r = await transition(tx, row.orderId, ['EVIDENCE_SUBMITTED'], target);
            if (r === 'APPLIED') {
              moved = orderState = target;
              await appendAudit(tx, {
                actor: 'system:paypal',
                type: 'DISPUTE_RESOLVED',
                entity: 'purchase_order',
                entityId: row.orderId,
                payload: { disputeId, outcome: row.outcome, result: target },
              });
            }
          } else if (changed) {
            await appendAudit(tx, {
              actor: 'system:paypal',
              type: 'DISPUTE_OUTCOME_UNMAPPED',
              entity: 'dispute',
              entityId: disputeId,
              payload: { outcome: row.outcome, note: 'PayPal resolved the dispute with an outcome code this system does not map to won or lost. A human must decide.' },
            });
          }
        } else if (resolved && orderState === 'DISPUTED' && changed) {
          await appendAudit(tx, {
            actor: 'system:paypal',
            type: 'DISPUTE_RESOLVED_WITHOUT_EVIDENCE',
            entity: 'dispute',
            entityId: disputeId,
            payload: { outcome: row.outcome, orderId: row.orderId, note: 'PayPal resolved this dispute before evidence was submitted. The order stays DISPUTED for a human to close out.' },
          });
        }
      }
    } else if (changed) {
      await appendAudit(tx, {
        actor: 'system:paypal',
        type: 'DISPUTE_UNMATCHED',
        entity: 'dispute',
        entityId: disputeId,
        payload: { disputedTransactions: remote.transactionIds, note: 'No order of ours has this capture id.' },
      });
    }

    return { dispute: row, orderId: row.orderId, orderState, changed, moved };
  }, ctx.db);
}

/* ------------------------------------------------------------------------------------------------------------------
 * Gathering facts from our own records
 * ---------------------------------------------------------------------------------------------------------------- */

interface GatheredFacts {
  plan: EvidenceFacts;
  render: Omit<RenderFacts, 'disputeId' | 'generatedAt'>;
}

/** The gatekeeper's stored rule results -> the checks the mandate PDF lists. Anything malformed is skipped, not invented. */
function gateChecks(gateResults: unknown): { name: string; passed: boolean; detail: string }[] {
  if (!Array.isArray(gateResults)) return [];
  const out: { name: string; passed: boolean; detail: string }[] = [];
  for (const r of gateResults) {
    const o = obj(r);
    if (!o || typeof o.pass !== 'boolean') continue;
    const name = str(o.label) ?? str(o.id);
    if (!name) continue;
    out.push({ name, passed: o.pass, detail: `expected ${String(o.expected ?? 'n/a')}; actual ${String(o.actual ?? 'n/a')}` });
  }
  return out;
}

/** Features exactly as the stored catalog response lists them, or none. */
function snapshotFeatures(response: unknown): string[] {
  const f = obj(response)?.features;
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
}

async function gatherFacts(ctx: PayPalContext, orderId: string, src: DisputeSources, captureId: string): Promise<GatheredFacts> {
  const order = await getOrder(ctx.db, orderId);
  if (!order) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
  const f = await getFulfillment(ctx.db, orderId);
  const refunds = await listRefunds(ctx.db, orderId);

  const tracking = f && f.carrier.trim() && f.trackingNumber.trim() ? { carrierName: f.carrier, trackingNumber: f.trackingNumber } : undefined;
  const hasMandate = Boolean(order.approvedBy && order.approvedAt);
  const hasSnapshot = Boolean(src.snapshot && src.proposal.title);
  const hasLedger = Boolean(order.paypalOrderId && order.authorizationId && order.captureId);

  const plan: EvidenceFacts = { tracking, hasMandate, hasSnapshot, hasLedger, refundIds: refunds.filter((r) => r.status !== 'FAILED' && r.status !== 'CANCELLED').map((r) => r.refundId) };

  const render: GatheredFacts['render'] = {
    orderId,
    captureId,
    ...(tracking && f
      ? { fulfillment: { carrier: f.carrier, trackingNumber: f.trackingNumber, shippedAt: f.shippedAt, deliveredAt: f.deliveredAt, source: f.source } }
      : {}),
    ...(hasMandate
      ? {
          mandate: {
            id: src.mandateId,
            hash: src.mandateSha256,
            approvedBy: order.approvedBy!,
            approvedAt: order.approvedAt!,
            payerApprovedAt: null, // PayPal's payer-approval time is not stored, and nothing here pretends otherwise
            gateChecks: gateChecks(src.proposal.gateResults),
          },
        }
      : {}),
    ...(hasSnapshot && src.snapshot
      ? {
          snapshot: {
            title: src.proposal.title!,
            features: snapshotFeatures(src.snapshot.response),
            priceMinor: src.proposal.unitPriceMinor,
            url: src.proposal.offerUrl ?? 'not recorded',
            capturedAt: src.snapshot.fetchedAt,
            hash: src.snapshot.sha256,
          },
        }
      : {}),
    ...(hasLedger
      ? {
          ledger: {
            approvedAt: order.approvedAt,
            paypalOrderId: order.paypalOrderId,
            authorizationId: order.authorizationId,
            authorizedAt: order.authCreatedAt,
            capturedAt: src.capturedAt,
            amountMinor: order.amountMinor,
            refunds: refunds.map((r) => ({ id: r.refundId, amountMinor: r.amountMinor, status: r.status })),
          },
        }
      : {}),
  };
  return { plan, render };
}

/* ------------------------------------------------------------------------------------------------------------------
 * Building, reviewing and checking an evidence bundle
 * ---------------------------------------------------------------------------------------------------------------- */

export type BuildResult =
  | { status: 'BUILT'; bundle: EvidenceBundleRow; plan: Extract<PlanResult, { status: 'PLANNED' }> }
  | { status: 'BLOCKED'; missing: string[]; reason: string };

/**
 * Plan, render and STORE the evidence for a dispute. Nothing is sent. The bundle (notes, PDFs and their hashes) is
 * written first, so what a human reviews and what is later submitted are the same bytes.
 *
 * `notes` are the seller's account of the case (≤ 2,000 characters). `author` says who wrote them, e.g. `agent:defense`.
 * If a required fact is missing the result is BLOCKED and names it: no weaker case is sent in its place.
 */
export async function buildEvidenceBundle(ctx: PayPalContext, disputeId: string, notes: string, author: string): Promise<BuildResult> {
  if (!author.trim()) throw new DomainError('VALIDATION', 'evidence notes need an author');
  const dispute = await getDispute(ctx.db, disputeId);
  if (!dispute) throw new DomainError('NOT_FOUND', `Dispute ${disputeId} is not synced yet`);
  if (!dispute.orderId) throw new DomainError('BAD_STATE', 'this dispute is not matched to an order of ours');
  const order = await getOrder(ctx.db, dispute.orderId);
  if (!order) throw new DomainError('NOT_FOUND', `Order ${dispute.orderId} not found`);
  if (order.state !== 'DISPUTED') throw new DomainError('BAD_STATE', `evidence can be built for a DISPUTED order, this one is ${order.state}`);
  if (!order.captureId) throw new DomainError('BAD_STATE', 'order has no capture');
  const src = await getDisputeSources(ctx.db, dispute.orderId);
  if (!src) throw new DomainError('NOT_FOUND', `no proposal or mandate on record for order ${dispute.orderId}`);

  const facts = await gatherFacts(ctx, dispute.orderId, src, order.captureId);
  const plan = planEvidence(dispute.reason ?? 'UNKNOWN', facts.plan);
  if (plan.status === 'BLOCKED') {
    await withTx(
      (tx) =>
        appendAudit(tx, {
          actor: 'system:evidence',
          type: 'EVIDENCE_BLOCKED',
          entity: 'dispute',
          entityId: disputeId,
          payload: { reason: plan.reason, missing: plan.missing },
        }),
      ctx.db,
    );
    return { status: 'BLOCKED', missing: plan.missing, reason: plan.reason };
  }

  const input = buildEvidenceInput(plan, notes); // throws VALIDATION on blank or over-long notes
  const files = await renderPdfs(plan, { ...facts.render, disputeId, generatedAt: ctx.clock.now() });
  const sha256 = bundleSha256(input, files);
  const id = uuidv7(ctx.clock.now().getTime());

  const bundle = await withTx(async (tx) => {
    const row = await insertEvidenceBundle(tx, { id, disputeId, plan, inputJson: input, files, sha256 });
    await appendAudit(tx, {
      actor: author.startsWith('agent:') || author.startsWith('user:') || author.startsWith('system:') ? author : `user:${author}`,
      type: 'EVIDENCE_BUNDLE_BUILT',
      entity: 'dispute',
      entityId: disputeId,
      payload: {
        bundleId: id,
        bundleSha256: sha256,
        reason: plan.reason,
        manualReview: plan.manualReview,
        notesSha256: sha256Hex(notes.trim()),
        files: files.map((f) => ({ name: f.name, sha256: f.sha256 })),
      },
    });
    return row;
  }, ctx.db);

  return { status: 'BUILT', bundle, plan };
}

/**
 * Everything that must still be true of a stored bundle before a human attests to it or it is sent: the hashes match
 * the bytes, the limits PayPal enforces hold, and the notes are within their limit.
 */
export function assertBundleIntegrity(b: EvidenceBundleRow): void {
  const bad = (why: string): never => {
    throw new DomainError('INTERNAL', `evidence bundle ${b.id} failed its integrity check: ${why}`);
  };
  if (b.files.length > MAX_FILES) bad(`${b.files.length} files, the limit is ${MAX_FILES}`);
  let total = 0;
  for (const f of b.files) {
    if (f.mime !== 'application/pdf') bad(`${f.name} is ${f.mime}, only PDFs are built`);
    if (!/^[a-z0-9-]+\.pdf$/.test(f.name)) bad(`unexpected file name ${f.name}`);
    const bytes = Buffer.from(f.bytes_base64, 'base64');
    if (sha256Hex(bytes) !== f.sha256) bad(`${f.name} does not match its recorded hash`);
    if (bytes.byteLength >= MAX_FILE_BYTES) bad(`${f.name} is over 10 MB`);
    total += bytes.byteLength;
  }
  if (total >= MAX_TOTAL_BYTES) bad('files together are over 50 MB');
  if (bundleSha256(b.inputJson, b.files) !== b.sha256) bad('the stored input and files do not match the bundle hash');
  const evidences = obj(b.inputJson)?.evidences;
  if (!Array.isArray(evidences) || evidences.length === 0) bad('no evidences');
  for (const e of evidences as unknown[]) {
    const notes = str(obj(e)?.notes);
    if (!notes) bad('an evidence has no notes');
    else if (notes.length > MAX_NOTES_CHARS) bad(`notes are ${notes.length} characters, the limit is ${MAX_NOTES_CHARS}`);
  }
}

/** A named human's attestation that they read the bundle. Required before it can be submitted. */
export async function reviewEvidenceBundle(ctx: PayPalContext, bundleId: string, reviewedBy: string): Promise<EvidenceBundleRow> {
  if (!reviewedBy.trim()) throw new DomainError('FORBIDDEN', 'a bundle needs a named human to review it');
  return withTx(async (tx) => {
    const b = await getEvidenceBundle(tx, bundleId, { forUpdate: true });
    if (!b) throw new DomainError('NOT_FOUND', `Evidence bundle ${bundleId} not found`);
    if (b.submittedAt) throw new DomainError('BAD_STATE', 'this bundle was already submitted');
    assertBundleIntegrity(b);
    if (!(await markBundleReviewed(tx, bundleId, reviewedBy.trim()))) throw new DomainError('CONCURRENT_UPDATE', 'bundle changed while it was being reviewed');
    await appendAudit(tx, {
      actor: `user:${reviewedBy.trim()}`,
      type: 'EVIDENCE_REVIEWED',
      entity: 'dispute',
      entityId: b.disputeId ?? bundleId,
      payload: { bundleId, bundleSha256: b.sha256, files: b.files.map((f) => ({ name: f.name, sha256: f.sha256 })) },
    });
    return { ...b, reviewedBy: reviewedBy.trim() };
  }, ctx.db);
}

/* ------------------------------------------------------------------------------------------------------------------
 * Submitting
 * ---------------------------------------------------------------------------------------------------------------- */

export interface SubmitResult {
  bundleId: string;
  disputeId: string;
  orderId: string;
  paypalResponse: unknown;
}

/**
 * Send a reviewed bundle to PayPal (POST /v1/customer/disputes/{id}/provide-evidence, multipart).
 *
 * Every condition is checked immediately before the call, against PayPal's live answer, not against what we stored
 * earlier:
 *   1. the bundle exists, is unsubmitted, was reviewed by a named human, and still matches its hash byte for byte;
 *   2. the order is DISPUTED;
 *   3. a fresh GET shows status WAITING_FOR_SELLER_RESPONSE, a provide-evidence link, and a response window still open.
 * The bundle row is locked for the whole call, so two submitters cannot both send it. If the commit after a successful
 * POST were to fail, the next attempt's fresh GET would no longer show the seller's turn and would refuse, so the
 * evidence is never sent twice by this code.
 */
export async function submitEvidence(ctx: PayPalContext, bundleId: string, submittedBy: string): Promise<SubmitResult> {
  if (!submittedBy.trim()) throw new DomainError('FORBIDDEN', 'submitting evidence needs a named human');

  return withTx(async (tx) => {
    const b = await getEvidenceBundle(tx, bundleId, { forUpdate: true });
    if (!b) throw new DomainError('NOT_FOUND', `Evidence bundle ${bundleId} not found`);
    if (!b.disputeId) throw new DomainError('BAD_STATE', 'bundle is not attached to a dispute');
    if (b.submittedAt) throw new DomainError('BAD_STATE', 'this bundle was already submitted');
    if (!b.reviewedBy) throw new DomainError('FORBIDDEN', 'a human must review this bundle before it is submitted');
    assertBundleIntegrity(b);

    const dispute = await getDispute(tx, b.disputeId);
    if (!dispute?.orderId) throw new DomainError('BAD_STATE', 'dispute is not matched to an order');
    const order = await getOrder(tx, dispute.orderId, { forUpdate: true });
    if (!order) throw new DomainError('NOT_FOUND', `Order ${dispute.orderId} not found`);
    if (order.state !== 'DISPUTED') throw new DomainError('BAD_STATE', `evidence can be submitted for a DISPUTED order, this one is ${order.state}`);

    const live = await fetchDispute(ctx, b.disputeId);
    await upsertDispute(tx, {
      paypalDisputeId: b.disputeId,
      orderId: dispute.orderId,
      reason: live.reason,
      status: live.status,
      lifeCycleStage: live.lifeCycleStage,
      sellerResponseDue: live.sellerResponseDue,
      links: live.links,
      outcome: live.outcomeCode,
    });
    if (live.status !== SELLER_TURN) throw new DomainError('BAD_STATE', `PayPal says the dispute is ${live.status ?? 'in an unknown status'}, not ${SELLER_TURN}`);
    if (!hasProvideEvidenceLink(live.links)) throw new DomainError('BAD_STATE', 'PayPal offers no provide-evidence action for this dispute right now');
    if (live.sellerResponseDue && live.sellerResponseDue.getTime() <= ctx.clock.now().getTime()) {
      throw new DomainError('BAD_STATE', `the response window closed at ${live.sellerResponseDue.toISOString()}`);
    }

    const form = new FormData();
    form.append('input', new Blob([JSON.stringify(b.inputJson)], { type: 'application/json' }), 'input.json');
    b.files.forEach((f: EvidenceFile, i) => {
      form.append(`file${i + 1}`, new Blob([Buffer.from(f.bytes_base64, 'base64')], { type: f.mime }), f.name);
    });

    const res = await paypalRest<unknown>(ctx, {
      method: 'POST',
      path: `/v1/customer/disputes/${b.disputeId}/provide-evidence`,
      form,
      action: 'dispute_evidence',
      subject: { type: 'dispute', id: b.disputeId },
      write: true,
    });

    const response = res.result ?? null;
    if (!(await markBundleSubmitted(tx, bundleId, response))) throw new DomainError('CONCURRENT_UPDATE', 'bundle was submitted by someone else');
    const t = await transition(tx, dispute.orderId, ['DISPUTED'], 'EVIDENCE_SUBMITTED');
    if (t === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while the evidence was being submitted');
    await appendAudit(tx, {
      actor: `user:${submittedBy.trim()}`,
      type: 'EVIDENCE_SUBMITTED',
      entity: 'dispute',
      entityId: b.disputeId,
      paypalRequestId: res.requestId,
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
      payload: {
        bundleId,
        bundleSha256: b.sha256,
        reviewedBy: b.reviewedBy,
        orderId: dispute.orderId,
        files: b.files.map((f) => ({ name: f.name, sha256: f.sha256 })),
        statusCode: res.statusCode,
        wasInState: live.status,
      },
    });
    return { bundleId, disputeId: b.disputeId, orderId: dispute.orderId, paypalResponse: response };
  }, ctx.db);
}

/** Exposed for the worker: whether we already sent evidence for a dispute, so a retry job can stop early. */
export const evidenceAlreadySubmitted = (ctx: PayPalContext, disputeId: string) => hasSubmittedBundle(ctx.db, disputeId);
