import { PaymentsController } from '@paypal/paypal-server-sdk';
import type { CapturedPayment, PaymentAuthorization } from '@paypal/paypal-server-sdk';
import { DomainError, usd } from '@aegis/core';
import { appendAudit, getFulfillment, getOrderBundle, recordReauthorization, transition, withTx } from '@aegis/db';
import { hasIssue, paypalCall } from './call.ts';
import type { PayPalContext } from './client.ts';
import { holdAmounts } from './orders.ts';

/** Reauthorize when less than this remains of the honor period (TDD "Void and reauthorize"). */
export const REAUTH_LEAD_MS = 2 * 3_600_000;

const payments = (ctx: PayPalContext) => new PaymentsController(ctx.sdk());

const usable = (s: string | undefined) => s === 'CREATED' || s === 'PENDING';

/** True for a final, order-specific 4xx from PayPal (not auth trouble, throttling or a timeout). */
function isFinalClientError(err: unknown): boolean {
  if (!(err instanceof DomainError) || err.code !== 'PAYPAL_ERROR') return false;
  const status = (err.details as { status?: number | null } | undefined)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

export async function getAuthorization(ctx: PayPalContext, orderRowId: string, authorizationId: string): Promise<PaymentAuthorization> {
  const res = await paypalCall<PaymentAuthorization>({
    db: ctx.db,
    action: 'get',
    orderRowId,
    write: false,
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: () => payments(ctx).getAuthorizedPayment({ authorizationId }),
  });
  return res.result;
}

/**
 * Capture the authorization hold. This is the proof gate, re-checked here against live data every time:
 *  1. the order is DELIVERED (or already SETTLED, which returns the stored capture: idempotent),
 *  2. a fulfillment row carries a carrier, a tracking number and a delivered_at that is not after the mandate deadline,
 *  3. the stored amount equals the amount recomputed from the gated proposal,
 *  4. PayPal's CURRENT authorization (fresh GET) is CREATED/PENDING, unexpired, and for exactly that amount.
 * Any failed condition is written to the audit log and nothing is sent to PayPal.
 * Capture is always `final_capture: true` for the authorized amount, so the hold cannot be partially drained.
 */
export async function capture(ctx: PayPalContext, orderRowId: string): Promise<{ captureId: string; status: string; reused: boolean }> {
  const bundle = await getOrderBundle(ctx.db, orderRowId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${orderRowId} not found`);
  const { order, mandate } = bundle;

  if (order.state === 'SETTLED' && order.captureId) return { captureId: order.captureId, status: 'COMPLETED', reused: true };

  const blocked = async (code: 'BAD_STATE' | 'PROOF_GATE_FAILED' | 'SLA_PASSED' | 'AMOUNT_MISMATCH' | 'ALREADY_CAPTURED', conditions: string[]): Promise<never> => {
    await withTx(
      (tx) =>
        appendAudit(tx, {
          actor: 'system:payments',
          type: 'CAPTURE_BLOCKED',
          entity: 'purchase_order',
          entityId: orderRowId,
          payload: { code, conditions, state: order.state },
        }),
      ctx.db,
    );
    throw new DomainError(code, `capture blocked: ${conditions.join('; ')}`, { details: { conditions } });
  };

  if (order.state !== 'DELIVERED') return blocked('BAD_STATE', [`order is ${order.state}, not DELIVERED`]);
  if (!order.authorizationId) return blocked('PROOF_GATE_FAILED', ['order has no authorization id']);

  const f = await getFulfillment(ctx.db, orderRowId);
  const missing: string[] = [];
  if (!f) missing.push('no fulfillment record');
  else {
    if (!f.carrier.trim()) missing.push('carrier missing');
    if (!f.trackingNumber.trim()) missing.push('tracking number missing');
    if (!f.deliveredAt) missing.push('delivered_at missing');
  }
  if (missing.length) return blocked('PROOF_GATE_FAILED', missing);
  if (f!.deliveredAt!.toISOString().slice(0, 10) > mandate.deliverBy) {
    return blocked('SLA_PASSED', [`delivered ${f!.deliveredAt!.toISOString()} after deliver_by ${mandate.deliverBy}`]);
  }

  const amounts = holdAmounts(bundle);
  if (amounts.total !== order.amountMinor) {
    return blocked('AMOUNT_MISMATCH', [`recomputed ${amounts.total} != stored ${order.amountMinor}`]);
  }

  const auth = await getAuthorization(ctx, orderRowId, order.authorizationId);
  if (auth.status === 'CAPTURED' || auth.status === 'PARTIALLY_CAPTURED') {
    return blocked('ALREADY_CAPTURED', [`PayPal authorization is ${auth.status}`]);
  }
  const live: string[] = [];
  if (!usable(auth.status)) live.push(`PayPal authorization is ${String(auth.status)}`);
  if (auth.expirationTime && new Date(auth.expirationTime) <= ctx.clock.now()) live.push(`authorization expired ${auth.expirationTime}`);
  if (auth.amount && (auth.amount.value !== usd.toPayPal(order.amountMinor) || auth.amount.currencyCode !== 'USD')) {
    live.push(`PayPal authorization amount ${auth.amount.value} ${auth.amount.currencyCode} != ${usd.toPayPal(order.amountMinor)} USD`);
  }
  if (live.length) return blocked('PROOF_GATE_FAILED', live);

  let captured: CapturedPayment;
  let requestId: string | undefined;
  let debugId: string | undefined;
  try {
    const res = await paypalCall<CapturedPayment>({
      db: ctx.db,
      action: 'capture',
      orderRowId,
      // a new authorization (after reauthorize) is a deliberate new attempt and gets a new request id
      attempt: Math.max(1, order.authorizationHistory.length),
      ...(ctx.deps ? { deps: ctx.deps } : {}),
      onUnauthorized: () => ctx.handleUnauthorized(),
      run: ({ requestId: rid }) =>
        payments(ctx).captureAuthorizedPayment({
          authorizationId: order.authorizationId!,
          paypalRequestId: rid,
          prefer: 'return=representation',
          body: { finalCapture: true, amount: { currencyCode: 'USD', value: usd.toPayPal(order.amountMinor) } },
        }),
    });
    captured = res.result;
    requestId = res.requestId;
    debugId = res.debugId;
  } catch (err) {
    if (hasIssue(err, 'AUTHORIZATION_ALREADY_CAPTURED')) {
      const e = err as DomainError;
      throw new DomainError('ALREADY_CAPTURED', 'PayPal reports this authorization is already captured', {
        ...(e.paypalDebugId ? { paypalDebugId: e.paypalDebugId } : {}),
        paypalName: 'AUTHORIZATION_ALREADY_CAPTURED',
      });
    }
    if (isFinalClientError(err)) {
      const e = err as DomainError;
      await withTx(async (tx) => {
        const r = await transition(tx, orderRowId, ['DELIVERED'], 'FAILED');
        if (r === 'APPLIED') {
          await appendAudit(tx, {
            actor: 'system:payments',
            type: 'CAPTURE_FAILED',
            entity: 'purchase_order',
            entityId: orderRowId,
            ...(e.paypalDebugId ? { paypalDebugId: e.paypalDebugId } : {}),
            payload: { paypalName: e.paypalName ?? null, message: e.message, details: e.details ?? null },
          });
        }
      }, ctx.db);
    }
    throw err;
  }

  if (!captured.id || captured.status !== 'COMPLETED') {
    // PENDING / DECLINED / missing id: do not claim SETTLED. The webhook + poller reconcile from PayPal.
    await withTx(
      (tx) =>
        appendAudit(tx, {
          actor: 'system:payments',
          type: 'CAPTURE_NOT_COMPLETED',
          entity: 'purchase_order',
          entityId: orderRowId,
          ...(requestId ? { paypalRequestId: requestId } : {}),
          ...(debugId ? { paypalDebugId: debugId } : {}),
          payload: { captureId: captured.id ?? null, status: captured.status ?? null },
        }),
      ctx.db,
    );
    throw new DomainError('PAYPAL_ERROR', `capture status is ${String(captured.status)}, expected COMPLETED`, {
      ...(debugId ? { paypalDebugId: debugId } : {}),
    });
  }
  const captureId = captured.id;

  await withTx(async (tx) => {
    const r = await transition(tx, orderRowId, ['DELIVERED'], 'SETTLED', { captureId });
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while capture was in flight', { details: { captureId } });
    if (r === 'ALREADY_THERE') return;
    await appendAudit(tx, {
      actor: 'system:payments',
      type: 'CAPTURED',
      entity: 'purchase_order',
      entityId: orderRowId,
      ...(requestId ? { paypalRequestId: requestId } : {}),
      ...(debugId ? { paypalDebugId: debugId } : {}),
      payload: {
        captureId,
        authorizationId: order.authorizationId,
        amountMinor: order.amountMinor.toString(),
        carrier: f!.carrier,
        trackingNumber: f!.trackingNumber,
        deliveredAt: f!.deliveredAt!.toISOString(),
        deliverBy: mandate.deliverBy,
        fulfillmentSource: f!.source,
      },
    });
  }, ctx.db);
  return { captureId, status: captured.status, reused: false };
}

export interface VoidInput {
  reason: 'SLA_BREACH' | 'CANCEL';
  /** Who confirmed the void (a human for SLA_BREACH per FR-07). */
  confirmedBy?: string;
}

/**
 * Release the hold. Only HELD / IN_TRANSIT orders can be voided. An authorization PayPal already captured is
 * ALREADY_CAPTURED; one PayPal already voided is treated as success so a retry after a lost response converges.
 */
export async function voidHold(ctx: PayPalContext, orderRowId: string, input: VoidInput): Promise<{ reused: boolean }> {
  const bundle = await getOrderBundle(ctx.db, orderRowId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${orderRowId} not found`);
  const { order, mandate } = bundle;

  if (order.state === 'VOIDED') return { reused: true };
  if (order.captureId) throw new DomainError('ALREADY_CAPTURED', 'order has been captured; refund instead of void');
  if (order.state !== 'HELD' && order.state !== 'IN_TRANSIT') throw new DomainError('BAD_STATE', `cannot void an order in ${order.state}`);
  if (!order.authorizationId) throw new DomainError('BAD_STATE', 'order has no authorization to void');

  let requestId: string | undefined;
  let debugId: string | undefined;
  try {
    const res = await paypalCall<PaymentAuthorization | null>({
      db: ctx.db,
      action: 'void',
      orderRowId,
      attempt: Math.max(1, order.authorizationHistory.length),
      ...(ctx.deps ? { deps: ctx.deps } : {}),
      onUnauthorized: () => ctx.handleUnauthorized(),
      run: ({ requestId: rid }) => payments(ctx).voidPayment({ authorizationId: order.authorizationId!, paypalRequestId: rid }),
    });
    requestId = res.requestId;
    debugId = res.debugId;
  } catch (err) {
    if (err instanceof DomainError && err.code === 'PAYPAL_ERROR') {
      if (hasIssue(err, 'AUTHORIZATION_ALREADY_CAPTURED')) {
        throw new DomainError('ALREADY_CAPTURED', 'PayPal reports this authorization is already captured', {
          ...(err.paypalDebugId ? { paypalDebugId: err.paypalDebugId } : {}),
          paypalName: 'AUTHORIZATION_ALREADY_CAPTURED',
        });
      }
      if (!hasIssue(err, 'AUTHORIZATION_VOIDED')) throw err; // already voided at PayPal: proceed to record it
      debugId = err.paypalDebugId;
    } else {
      throw err;
    }
  }

  const now = ctx.clock.now();
  await withTx(async (tx) => {
    const r = await transition(tx, orderRowId, ['HELD', 'IN_TRANSIT'], 'VOIDED');
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while the void was in flight');
    if (r === 'ALREADY_THERE') return;
    await appendAudit(tx, {
      actor: input.confirmedBy ? `user:${input.confirmedBy}` : 'system:payments',
      type: 'HOLD_VOIDED',
      entity: 'purchase_order',
      entityId: orderRowId,
      ...(requestId ? { paypalRequestId: requestId } : {}),
      ...(debugId ? { paypalDebugId: debugId } : {}),
      payload: {
        reason: input.reason,
        authorizationId: order.authorizationId,
        amountMinor: order.amountMinor.toString(),
        deliverBy: mandate.deliverBy,
        voidedAt: now.toISOString(),
        previousState: order.state,
      },
    });
  }, ctx.db);
  return { reused: false };
}

/**
 * Whether a reauthorization is due: SLA still open, hold still held, and less than REAUTH_LEAD_MS of the honor
 * period left. Never past `auth_expires_at`.
 */
export function reauthDue(o: { state: string; honorEndsAt: Date | null; authExpiresAt: Date | null }, now: Date): boolean {
  if ((o.state !== 'HELD' && o.state !== 'IN_TRANSIT') || !o.honorEndsAt || !o.authExpiresAt) return false;
  return now.getTime() > o.honorEndsAt.getTime() - REAUTH_LEAD_MS && now < o.authExpiresAt;
}

/**
 * Reauthorize an authorization nearing the end of its honor period. The new id is pushed onto
 * authorization_history; later captures and voids use the newest id. `attempt` is the deliberate attempt number
 * (2 for the first reauthorization): a new attempt is a new PayPal-Request-Id.
 */
export async function reauthorize(ctx: PayPalContext, orderRowId: string, attempt: number): Promise<{ authorizationId: string }> {
  if (!Number.isInteger(attempt) || attempt < 2) throw new DomainError('VALIDATION', 'a reauthorization is attempt 2 or higher');
  const bundle = await getOrderBundle(ctx.db, orderRowId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${orderRowId} not found`);
  const { order } = bundle;
  if (order.state !== 'HELD' && order.state !== 'IN_TRANSIT') throw new DomainError('BAD_STATE', `cannot reauthorize an order in ${order.state}`);
  if (!order.authorizationId) throw new DomainError('BAD_STATE', 'order has no authorization to reauthorize');
  if (order.authExpiresAt && order.authExpiresAt <= ctx.clock.now()) {
    throw new DomainError('BAD_STATE', 'authorization has already expired; it cannot be reauthorized');
  }
  if (order.authorizationHistory.length >= attempt) {
    // This attempt already ran (a retry after a lost response): the stored id is the reauthorized one.
    return { authorizationId: order.authorizationId };
  }

  const res = await paypalCall<PaymentAuthorization>({
    db: ctx.db,
    action: 'reauthorize',
    orderRowId,
    attempt,
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: ({ requestId }) => payments(ctx).reauthorizePayment({ authorizationId: order.authorizationId!, paypalRequestId: requestId }),
  });
  const a = res.result;
  if (!a.id || !a.createTime || !a.expirationTime || !usable(a.status)) {
    throw new DomainError('PAYPAL_ERROR', 'PayPal reauthorize returned an incomplete or unusable authorization', {
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
    });
  }
  const createdAt = new Date(a.createTime);
  const next = {
    authorizationId: a.id,
    authCreatedAt: createdAt,
    honorEndsAt: new Date(createdAt.getTime() + 3 * 24 * 3_600_000),
    authExpiresAt: new Date(a.expirationTime),
  };
  await withTx(async (tx) => {
    const applied = await recordReauthorization(tx, orderRowId, order.authorizationId!, next);
    if (!applied) throw new DomainError('CONCURRENT_UPDATE', 'authorization changed while reauthorizing');
    await appendAudit(tx, {
      actor: 'system:payments',
      type: 'HOLD_REAUTHORIZED',
      entity: 'purchase_order',
      entityId: orderRowId,
      paypalRequestId: res.requestId,
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
      payload: {
        previousAuthorizationId: order.authorizationId,
        authorizationId: a.id,
        expiresAt: next.authExpiresAt.toISOString(),
        honorEndsAt: next.honorEndsAt.toISOString(),
        attempt,
      },
    });
  }, ctx.db);
  return { authorizationId: a.id };
}
