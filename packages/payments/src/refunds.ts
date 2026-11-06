import { PaymentsController } from '@paypal/paypal-server-sdk';
import type { Refund } from '@paypal/paypal-server-sdk';
import { DomainError, usd } from '@aegis/core';
import {
  appendAudit, getOrderBundle, getRefundRow, insertRefund, listPendingRefunds, listRefunds, refundedMinor, settleRefund, transition,
  withAdvisoryLock, withTx,
} from '@aegis/db';
import type { RefundStatus } from '@aegis/db';
import { hasIssue, paypalCall } from './call.ts';
import type { PayPalContext } from './client.ts';

export interface RefundInput {
  /** Minor units (USD cents). Omit to refund everything not yet refunded. */
  amountMinor?: bigint;
  reason: string;
  /** The human who confirmed the refund. Money never goes back on an agent's say-so. */
  confirmedBy: string;
}

export interface RefundResult {
  refundId: string;
  status: RefundStatus;
  amountMinor: bigint;
  /** Everything refunded or on its way back for this order, including this refund. */
  refundedMinor: bigint;
  /** True when this refund brought the order to REFUNDED. */
  fullyRefunded: boolean;
}

const payments = (ctx: PayPalContext) => new PaymentsController(ctx.sdk());

const KNOWN: ReadonlySet<string> = new Set<RefundStatus>(['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED']);

/**
 * Refund a settled order's capture, in full or in part.
 *
 * - Needs a named human (`confirmedBy`) and a reason; the order must be SETTLED or DISPUTED and have a capture id.
 * - The cumulative refunds can never exceed the capture. Refunds for one order are serialised by a per-order advisory
 *   lock (see withAdvisoryLock), so the local check is authoritative across processes; PayPal's own
 *   REFUND_AMOUNT_EXCEEDED stays as a backstop and is mapped to the same error.
 * - The idempotency attempt is (refunds recorded so far + 1). A retry after a lost response re-sends the SAME
 *   request id and PayPal replays the original refund; a refund that was recorded moves the next one to a new id.
 * - A partial refund keeps the order SETTLED. It moves to REFUNDED only when COMPLETED + PENDING refunds equal the
 *   capture amount and none of them is still PENDING (a PENDING refund can still fail, so it is not final).
 */
export async function refundCapture(ctx: PayPalContext, orderRowId: string, input: RefundInput): Promise<RefundResult> {
  if (!input.confirmedBy.trim()) throw new DomainError('FORBIDDEN', 'a refund needs a named human to confirm it');
  if (!input.reason.trim()) throw new DomainError('VALIDATION', 'a refund needs a reason');
  if (input.amountMinor !== undefined && input.amountMinor <= 0n) throw new DomainError('VALIDATION', 'refund amount must be positive');

  // Everything from reading the ledger to recording PayPal's answer runs under one per-order lock. Without it two
  // concurrent refunds both read "nothing refunded yet", pick the same idempotency attempt, and rely on PayPal to sort
  // it out. With it the second one sees the first one's refund and gets the right attempt and the right remainder.
  return withAdvisoryLock(`refund:${orderRowId}`, () => refundLocked(ctx, orderRowId, input), ctx.db);
}

async function refundLocked(ctx: PayPalContext, orderRowId: string, input: RefundInput): Promise<RefundResult> {
  const bundle = await getOrderBundle(ctx.db, orderRowId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${orderRowId} not found`);
  const { order } = bundle;
  if (order.state !== 'SETTLED' && order.state !== 'DISPUTED') {
    throw new DomainError('BAD_STATE', `only a SETTLED or DISPUTED order can be refunded, this one is ${order.state}`);
  }
  if (!order.captureId) throw new DomainError('BAD_STATE', 'order has no capture to refund');

  const existing = await listRefunds(ctx.db, orderRowId);
  const already = await refundedMinor(ctx.db, orderRowId);
  const left = order.amountMinor - already;
  if (left <= 0n) throw new DomainError('AMOUNT_MISMATCH', 'the capture has already been refunded in full', { details: { refundedMinor: already.toString() } });
  const amountMinor = input.amountMinor ?? left;
  if (amountMinor > left) {
    throw new DomainError('AMOUNT_MISMATCH', `refund ${amountMinor} exceeds the ${left} still refundable`, {
      details: { requestedMinor: amountMinor.toString(), refundableMinor: left.toString() },
    });
  }

  let res;
  try {
    res = await paypalCall<Refund>({
      db: ctx.db,
      action: 'refund',
      orderRowId,
      attempt: existing.length + 1,
      ...(ctx.deps ? { deps: ctx.deps } : {}),
      onUnauthorized: () => ctx.handleUnauthorized(),
      run: ({ requestId }) =>
        payments(ctx).refundCapturedPayment({
          captureId: order.captureId!,
          paypalRequestId: requestId,
          prefer: 'return=representation',
          body: { amount: { currencyCode: 'USD', value: usd.toPayPal(amountMinor) }, noteToPayer: input.reason.slice(0, 255) },
        }),
    });
  } catch (err) {
    if (err instanceof DomainError && err.code === 'PAYPAL_ERROR' && (hasIssue(err, 'REFUND_AMOUNT_EXCEEDED') || hasIssue(err, 'CAPTURE_FULLY_REFUNDED'))) {
      throw new DomainError('AMOUNT_MISMATCH', 'PayPal says this refund exceeds what is left on the capture', {
        ...(err.paypalDebugId ? { paypalDebugId: err.paypalDebugId } : {}),
        paypalName: hasIssue(err, 'CAPTURE_FULLY_REFUNDED') ? 'CAPTURE_FULLY_REFUNDED' : 'REFUND_AMOUNT_EXCEEDED',
      });
    }
    throw err;
  }

  const refund = res.result;
  const status = refund.status ?? 'COMPLETED';
  if (!refund.id || !KNOWN.has(status)) {
    throw new DomainError('PAYPAL_ERROR', 'PayPal returned a refund without an id or with an unknown status', {
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
      details: { id: refund.id ?? null, status: refund.status ?? null },
    });
  }
  // The refund PayPal made is the one on record, so a different amount is a hard stop, not a silent rewrite.
  if (refund.amount && (refund.amount.value !== usd.toPayPal(amountMinor) || refund.amount.currencyCode !== 'USD')) {
    throw new DomainError('AMOUNT_MISMATCH', `PayPal refunded ${refund.amount.value} ${refund.amount.currencyCode}, expected ${usd.toPayPal(amountMinor)} USD`, {
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
    });
  }

  return withTx(async (tx) => {
    await insertRefund(tx, {
      refundId: refund.id!,
      orderId: orderRowId,
      amountMinor,
      status: status as RefundStatus,
      reason: input.reason,
      confirmedBy: input.confirmedBy,
    });
    const total = await refundedMinor(tx, orderRowId);
    const pending = (await listRefunds(tx, orderRowId)).some((r) => r.status === 'PENDING');
    let fullyRefunded = false;
    if (total >= order.amountMinor && !pending) {
      const r = await transition(tx, orderRowId, ['SETTLED', 'DISPUTED'], 'REFUNDED');
      if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while the refund was in flight', { details: { refundId: refund.id } });
      fullyRefunded = true;
    }
    await appendAudit(tx, {
      actor: `user:${input.confirmedBy}`,
      type: 'REFUNDED',
      entity: 'purchase_order',
      entityId: orderRowId,
      paypalRequestId: res.requestId,
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
      payload: {
        refundId: refund.id,
        captureId: order.captureId,
        status,
        amountMinor: amountMinor.toString(),
        refundedMinor: total.toString(),
        captureAmountMinor: order.amountMinor.toString(),
        reason: input.reason,
        fullyRefunded,
        previousState: order.state,
      },
    });
    return { refundId: refund.id!, status: status as RefundStatus, amountMinor, refundedMinor: total, fullyRefunded };
  }, ctx.db);
}

export interface RefundReconciliation {
  refundId: string;
  orderId: string;
  before: RefundStatus;
  after: RefundStatus;
  /** True when the order moved to REFUNDED because this refund was the last thing outstanding. */
  orderRefunded: boolean;
}

/**
 * Follow one PENDING refund to the status PayPal now reports (GET /v2/payments/refunds/{id}).
 *
 * A PENDING refund counts against the capture the moment it is made, so without this an order whose refund later
 * COMPLETED would never reach REFUNDED, and one whose refund FAILED would keep money "refunded" that never left.
 *  - COMPLETED: the refund stands; if the captured amount is now fully refunded and nothing else is pending, the order
 *    moves to REFUNDED.
 *  - FAILED / CANCELLED: the refund stops counting, so that amount can be refunded again.
 *  - still PENDING: nothing changes and nothing is audited (this runs on a poll).
 * Serialised with refundCapture by the same per-order lock, so a reconcile can never interleave with a new refund.
 */
export async function reconcileRefund(ctx: PayPalContext, refundId: string): Promise<RefundReconciliation | null> {
  const row = await getRefundRow(ctx.db, refundId);
  if (!row) throw new DomainError('NOT_FOUND', `Refund ${refundId} is not on record`);
  if (row.status !== 'PENDING') return null;

  return withAdvisoryLock(`refund:${row.orderId}`, async () => {
    const current = await getRefundRow(ctx.db, refundId);
    if (!current || current.status !== 'PENDING') return null; // settled by someone else while we waited

    const res = await paypalCall<Refund>({
      db: ctx.db,
      action: 'get',
      orderRowId: row.orderId,
      write: false,
      ...(ctx.deps ? { deps: ctx.deps } : {}),
      onUnauthorized: () => ctx.handleUnauthorized(),
      run: () => payments(ctx).getRefund({ refundId }),
    });
    const live = res.result.status;
    if (!live || !KNOWN.has(live)) {
      throw new DomainError('PAYPAL_ERROR', `PayPal reported refund ${refundId} with unknown status ${String(live)}`, {
        ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
      });
    }
    if (live === 'PENDING') return null;

    return withTx(async (tx) => {
      const settled = await settleRefund(tx, refundId, live as RefundStatus);
      if (!settled) return null;
      const bundle = await getOrderBundle(tx, row.orderId);
      const order = bundle!.order;
      const total = await refundedMinor(tx, row.orderId);
      const stillPending = (await listRefunds(tx, row.orderId)).some((r) => r.status === 'PENDING');
      let orderRefunded = false;
      if (live === 'COMPLETED' && total >= order.amountMinor && !stillPending && (order.state === 'SETTLED' || order.state === 'DISPUTED')) {
        const r = await transition(tx, row.orderId, ['SETTLED', 'DISPUTED'], 'REFUNDED');
        if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while its refund was being reconciled', { details: { refundId } });
        orderRefunded = true;
      }
      await appendAudit(tx, {
        actor: 'system:reconcile',
        type: 'REFUND_STATUS_CHANGED',
        entity: 'purchase_order',
        entityId: row.orderId,
        ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
        payload: {
          refundId,
          from: 'PENDING',
          to: live,
          amountMinor: row.amountMinor.toString(),
          refundedMinor: total.toString(),
          captureAmountMinor: order.amountMinor.toString(),
          orderRefunded,
          orderState: order.state,
        },
      });
      return { refundId, orderId: row.orderId, before: 'PENDING' as const, after: live as RefundStatus, orderRefunded };
    }, ctx.db);
  }, ctx.db);
}

/** One reconcile pass over every PENDING refund. A failure on one refund is reported, never allowed to stop the rest. */
export async function reconcilePendingRefunds(ctx: PayPalContext): Promise<{ changed: RefundReconciliation[]; errors: Array<{ refundId: string; error: string }> }> {
  const changed: RefundReconciliation[] = [];
  const errors: Array<{ refundId: string; error: string }> = [];
  for (const r of await listPendingRefunds(ctx.db)) {
    try {
      const out = await reconcileRefund(ctx, r.refundId);
      if (out) changed.push(out);
    } catch (err) {
      errors.push({ refundId: r.refundId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { changed, errors };
}
