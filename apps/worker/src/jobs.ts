import { DomainError } from '@aegis/core';
import type { Clock } from '@aegis/core';
import {
  appendAudit,
  countAuditOfType,
  getFulfillment,
  getOrder,
  hasAuditEvent,
  listOpenDisputeIds,
  listOrdersInStates,
  listSlaBreaches,
  markTrackingPushed,
  transition,
  withTx,
} from '@aegis/db';
import {
  INSTRUMENT_DECLINED_AUDIT,
  authorizeHold,
  capture,
  getAuthorization,
  getPayPalOrder,
  processPendingWebhooks,
  pushTracking,
  reauthDue,
  reauthorize,
  reconcilePendingRefunds,
  syncDispute,
  verifyPendingWebhooks,
  voidHold,
} from '@aegis/payments';
import type { VoidInput, WebhookFollowUp, WebhookPipeline } from '@aegis/payments';

/**
 * Everything the worker does, as plain functions over real dependencies (Postgres + the PayPal context). pg-boss
 * only decides *when* these run (index.ts); keeping them free of it lets the tests drive them against real
 * Postgres and the PayPal contract server without a queue in the way.
 */
export interface WorkerDeps {
  pipeline: WebhookPipeline;
  /** The app clock, so Judge Mode's demo offset moves SLA checks the same way it moves everything else. */
  clock: Clock;
  /** Queue a follow-up job. Production wires this to boss.send; tests record it. */
  enqueue(job: WebhookFollowUp): Promise<void>;
}

const ctxOf = (d: WorkerDeps) => d.pipeline.ctx;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ------------------------------------------------------------------------------------------------------------------
 * What a failed job means
 * ---------------------------------------------------------------------------------------------------------------- */

/** Codes where running the same job again cannot help: the order is in the wrong place, or the input is wrong. */
const PERMANENT = new Set([
  'NOT_FOUND', 'BAD_STATE', 'VALIDATION', 'PROOF_GATE_FAILED', 'SLA_PASSED', 'AMOUNT_MISMATCH', 'ALREADY_CAPTURED',
  'CARRIER_UNKNOWN', 'ORDER_NOT_APPROVED', 'INSTRUMENT_DECLINED',
]);

/**
 * - `deferred`: PAYPAL_WRITES_ENABLED is off. Not a failure and not worth a retry slot; try again later.
 * - `permanent`: retrying repeats the same answer. Record it and stop (the audit log already has the reason).
 * - `retry`: anything else (PayPal 5xx after the wrapper's own retries, a lost connection): let the queue retry.
 */
export function classifyFailure(err: unknown): 'deferred' | 'permanent' | 'retry' {
  if (err instanceof Error && err.name === 'ZodError') return 'permanent'; // a malformed payload will be malformed again
  if (err instanceof DomainError) {
    if (err.code === 'WRITES_DISABLED') return 'deferred';
    if (PERMANENT.has(err.code)) return 'permanent';
  }
  return 'retry';
}

/* ------------------------------------------------------------------------------------------------------------------
 * Webhooks
 * ---------------------------------------------------------------------------------------------------------------- */

export interface SweepResult {
  verified: number;
  rejected: number;
  processed: number;
  retrying: number;
  gaveUp: number;
  deferred: number;
  followUps: number;
}

/**
 * Verify every stored event that is not verified yet, then apply verified ones, oldest first, until a pass comes back
 * short. Safe for several workers at once (claiming is SKIP LOCKED) and safe to run when nothing is pending.
 */
export async function runWebhookSweep(d: WorkerDeps, batch = 25, maxPasses = 5): Promise<SweepResult> {
  const out: SweepResult = { verified: 0, rejected: 0, processed: 0, retrying: 0, gaveUp: 0, deferred: 0, followUps: 0 };
  const v = await verifyPendingWebhooks(d.pipeline);
  out.verified = v.verified;
  out.rejected = v.rejected;
  out.retrying += v.retrying;
  out.gaveUp += v.gaveUp;
  for (let pass = 0; pass < maxPasses; pass++) {
    const p = await processPendingWebhooks(d.pipeline, { limit: batch });
    out.processed += p.outcomes.length;
    out.retrying += p.retrying;
    out.gaveUp += p.gaveUp;
    out.deferred += p.deferred;
    for (const o of p.outcomes) {
      for (const f of o.followUps) {
        await d.enqueue(f);
        out.followUps++;
      }
    }
    // A deferred event stays claimable, so stop: another pass would just meet it again.
    if (p.deferred > 0 || p.outcomes.length + p.retrying + p.gaveUp < batch) break;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Money moves
 * ---------------------------------------------------------------------------------------------------------------- */

/** Capture after the proof gate (checked again inside `capture`). Queues the tracking push once the money is captured. */
export async function runCapture(d: WorkerDeps, orderId: string): Promise<{ captureId: string; reused: boolean }> {
  const r = await capture(ctxOf(d), orderId);
  await d.enqueue({ job: 'tracking.push', orderId, captureId: r.captureId });
  return { captureId: r.captureId, reused: r.reused };
}

/** Release the hold. For an SLA breach the caller passes the human who confirmed it (FR-07). */
export async function runVoid(d: WorkerDeps, orderId: string, input: VoidInput): Promise<{ reused: boolean }> {
  return voidHold(ctxOf(d), orderId, input);
}

export type TrackingResult = 'PUSHED' | 'ALREADY_PUSHED' | 'NO_FULFILLMENT' | 'STALE';

/**
 * Send carrier and tracking number to PayPal. Orders v2 tracking needs a capture id, so this only runs after capture,
 * and it checks the capture it was asked about is still the order's capture. Recorded in the same transaction as the
 * `pushed_to_paypal_at` stamp so "pushed" is never claimed without an audit row.
 */
export async function runTrackingPush(d: WorkerDeps, orderId: string, captureId: string): Promise<TrackingResult> {
  const ctx = ctxOf(d);
  const order = await getOrder(ctx.db, orderId);
  if (!order) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
  if (order.captureId !== captureId) return 'STALE';
  if (!order.paypalOrderId) throw new DomainError('BAD_STATE', 'order has no PayPal order id');
  const f = await getFulfillment(ctx.db, orderId);
  if (!f) return 'NO_FULFILLMENT';
  if (f.pushedToPaypalAt) return 'ALREADY_PUSHED';

  await pushTracking(ctx, orderId, order.paypalOrderId, { captureId, carrier: f.carrier, trackingNumber: f.trackingNumber });
  await withTx(async (tx) => {
    if (!(await markTrackingPushed(tx, orderId, d.clock.now()))) return; // a concurrent push got there first
    await appendAudit(tx, {
      actor: 'system:worker',
      type: 'TRACKING_PUSHED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { captureId, carrier: f.carrier, trackingNumber: f.trackingNumber, fulfillmentSource: f.source },
    });
  }, ctx.db);
  return 'PUSHED';
}

/* ------------------------------------------------------------------------------------------------------------------
 * Timers
 * ---------------------------------------------------------------------------------------------------------------- */

/** The app clock's calendar day, UTC: the same day boundary the mandate's `deliver_by` is stored in. */
const today = (clock: Clock) => clock.now().toISOString().slice(0, 10);

/**
 * Flag orders whose delivery deadline has passed while the hold is still open. This does NOT void: voiding releases
 * the money and the spec has a human confirm it (FR-07). The flag is one audit row per order, written once, which is
 * what the dashboard's "SLA breached: confirm void" prompt reads. Returns the order ids flagged by this run.
 */
export async function runSlaWatch(d: WorkerDeps): Promise<string[]> {
  const ctx = ctxOf(d);
  const flagged: string[] = [];
  for (const { order, deliverBy } of await listSlaBreaches(ctx.db, today(d.clock))) {
    await withTx(async (tx) => {
      // Two overlapping runs must not both flag the same order: serialise per order, then look again.
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`sla-flag:${order.id}`]);
      if (await hasAuditEvent(tx, 'SLA_BREACH_FLAGGED', order.id)) return;
      await appendAudit(tx, {
        actor: 'system:sla-watch',
        type: 'SLA_BREACH_FLAGGED',
        entity: 'purchase_order',
        entityId: order.id,
        payload: { deliverBy, state: order.state, amountMinor: order.amountMinor.toString(), authorizationId: order.authorizationId, flaggedOn: today(d.clock) },
      });
      flagged.push(order.id);
    }, ctx.db);
  }
  return flagged;
}

/**
 * Reauthorize holds whose honor period has ended while the delivery SLA is still open (P1). One order failing never stops
 * the rest. Two clocks, on purpose: the honor period and expiry are PayPal's instants, so they are compared with the real
 * clock (the PayPal context's), never Judge Mode's offset; the SLA is the app's own deadline, so it follows the app
 * clock. A breached hold is left alone: it waits for a human to void it, and extending it would only prolong the hold.
 */
export async function runReauthSweep(d: WorkerDeps): Promise<{ reauthorized: string[]; errors: Array<{ orderId: string; error: string }> }> {
  const ctx = ctxOf(d);
  const out = { reauthorized: [] as string[], errors: [] as Array<{ orderId: string; error: string }> };
  const paypalNow = ctx.clock.now();
  const breached = new Set((await listSlaBreaches(ctx.db, today(d.clock))).map((b) => b.order.id));
  for (const o of await listOrdersInStates(ctx.db, ['HELD', 'IN_TRANSIT'])) {
    if (breached.has(o.id) || !reauthDue(o, paypalNow)) continue;
    try {
      await reauthorize(ctx, o.id, o.authorizationHistory.length + 1);
      out.reauthorized.push(o.id);
    } catch (err) {
      out.errors.push({ orderId: o.id, error: msg(err) });
    }
  }
  return out;
}

export async function runRefundReconcile(d: WorkerDeps) {
  return reconcilePendingRefunds(ctxOf(d));
}

/* ------------------------------------------------------------------------------------------------------------------
 * Gap protection: webhooks are best effort, so every open item is re-read from PayPal on a timer
 * ---------------------------------------------------------------------------------------------------------------- */

export interface PollResult {
  checked: number;
  /** order ids this pass moved */
  applied: string[];
  /** things a human should look at (PayPal and we disagree in a way the state machine cannot resolve) */
  alerts: Array<{ orderId: string; kind: string }>;
  errors: Array<{ ref: string; error: string }>;
}

/** An approval younger than this is left to the approve route; the poller only backstops one that never arrived. */
const APPROVAL_GRACE_MS = 2 * 60_000;

/**
 * Re-fetch what PayPal says about every open order and dispute and apply the same rules the webhook handlers do:
 *  - AWAITING_APPROVAL: the buyer approved but our `onApprove` never arrived → authorize the hold.
 *  - HELD / IN_TRANSIT: PayPal voided the authorization → record it. Expired or captured outside our flow → alert once.
 *  - DISPUTED / EVIDENCE_SUBMITTED: sync the dispute.
 * DELIVERED is not polled: `capture` settles the order itself, and a capture made behind our back already raises an
 * alert through the CAPTURE.COMPLETED webhook.
 */
export async function runPollOpen(d: WorkerDeps): Promise<PollResult> {
  const ctx = ctxOf(d);
  const out: PollResult = { checked: 0, applied: [], alerts: [], errors: [] };
  const fail = (ref: string, err: unknown) => out.errors.push({ ref, error: msg(err) });

  for (const o of await listOrdersInStates(ctx.db, ['AWAITING_APPROVAL'])) {
    // updated_at is a real database timestamp, so the grace is measured on the real clock, not Judge Mode's offset one.
    if (!o.paypalOrderId || ctx.clock.now().getTime() - o.updatedAt.getTime() < APPROVAL_GRACE_MS) continue;
    // After a decline PayPal may still call the order APPROVED. Authorizing again from here would retry the declined
    // instrument on every tick, so a declined order waits for the buyer's next approval in the app instead.
    if ((await countAuditOfType(ctx.db, o.id, INSTRUMENT_DECLINED_AUDIT)) > 0) continue;
    out.checked++;
    try {
      const remote = await getPayPalOrder(ctx, o.id, o.paypalOrderId);
      if (remote.status !== 'APPROVED') continue; // not approved yet: nothing to do, and no write is attempted
      await authorizeHold(ctx, o.id, o.paypalOrderId);
      out.applied.push(o.id);
    } catch (err) {
      // INSTRUMENT_DECLINED waits for the buyer to choose another funding source in PayPal; polling again cannot fix it.
      if (err instanceof DomainError && (err.code === 'ORDER_NOT_APPROVED' || err.code === 'INSTRUMENT_DECLINED' || err.code === 'BAD_STATE')) continue;
      fail(o.id, err);
    }
  }

  for (const o of await listOrdersInStates(ctx.db, ['HELD', 'IN_TRANSIT'])) {
    if (!o.authorizationId) continue;
    out.checked++;
    try {
      const auth = await getAuthorization(ctx, o.id, o.authorizationId);
      const status = String(auth.status);
      if (status === 'VOIDED') {
        const moved = await withTx(async (tx) => {
          const r = await transition(tx, o.id, ['HELD', 'IN_TRANSIT'], 'VOIDED');
          if (r !== 'APPLIED') return false;
          await appendAudit(tx, {
            actor: 'system:poller',
            type: 'HOLD_VOIDED_AT_PAYPAL',
            entity: 'purchase_order',
            entityId: o.id,
            payload: { authorizationId: o.authorizationId, previousState: o.state, amountMinor: o.amountMinor.toString() },
          });
          return true;
        }, ctx.db);
        if (moved) out.applied.push(o.id);
      } else if (status === 'EXPIRED' || status === 'CAPTURED' || status === 'PARTIALLY_CAPTURED') {
        // The state machine has no edge for these from HELD/IN_TRANSIT, so a person decides. Say so once, not every 2 minutes.
        const type = `POLL_AUTHORIZATION_${status}`;
        const fresh = await withTx(async (tx) => {
          await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`poll-alert:${type}:${o.id}`]);
          if (await hasAuditEvent(tx, type, o.id)) return false;
          await appendAudit(tx, {
            actor: 'system:poller',
            type,
            entity: 'purchase_order',
            entityId: o.id,
            payload: { authorizationId: o.authorizationId, state: o.state, paypalStatus: status },
          });
          return true;
        }, ctx.db);
        if (fresh) out.alerts.push({ orderId: o.id, kind: type });
      }
    } catch (err) {
      fail(o.id, err);
    }
  }

  for (const disputeId of await listOpenDisputeIds(ctx.db)) {
    out.checked++;
    try {
      const s = await syncDispute(ctx, disputeId);
      if (s.moved && s.orderId) out.applied.push(s.orderId);
    } catch (err) {
      fail(disputeId, err);
    }
  }
  return out;
}
