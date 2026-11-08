import { PaymentsController } from '@paypal/paypal-server-sdk';
import type { CapturedPayment } from '@paypal/paypal-server-sdk';
import { DomainError, usd } from '@aegis/core';
import { appendAudit, findOrderIdByPayPalRef, getFulfillment, getOrder, getRefundRow, transition, withTx } from '@aegis/db';
import type { WebhookEventRow } from '@aegis/db';
import { getAuthorization } from '../authorizations.ts';
import { paypalCall } from '../call.ts';
import type { PayPalContext } from '../client.ts';
import { syncDispute } from '../disputes.ts';
import { authorizeHold } from '../orders.ts';
import { reconcileRefund } from '../refunds.ts';

/**
 * The webhook processor (TDD "Processor"). A webhook is a hint, never an instruction: every handler re-fetches the
 * resource it names from PayPal and acts on what PayPal says now, through the guarded state machine. Events can arrive
 * twice, late or out of order; because each transition names the states it may leave, applying them in any order
 * converges on PayPal's real state, and a replay changes nothing.
 *
 * Only events whose signature was verified are processed. A handler that cannot find the order an event names records
 * that (WEBHOOK_UNLINKED) and does nothing else; a handler that finds PayPal and us disagreeing in a way the state
 * machine has no edge for records WEBHOOK_STATE_MISMATCH for a human and moves nothing.
 */

export type WebhookAction = 'APPLIED' | 'NOOP' | 'IGNORED' | 'UNLINKED' | 'ALERT';

/** Work the processor found but does not do itself, for the worker to queue. */
export interface WebhookFollowUp {
  job: 'tracking.push';
  orderId: string;
  captureId: string;
}

export interface WebhookOutcome {
  eventId: string;
  eventType: string;
  action: WebhookAction;
  detail: string;
  orderId: string | null;
  followUps: WebhookFollowUp[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

interface ParsedEvent {
  id: string;
  type: string;
  resource: Json;
}

function parseEvent(raw: Buffer): ParsedEvent | null {
  try {
    const j = obj(JSON.parse(raw.toString('utf8')));
    const id = str(j.id);
    const type = str(j.event_type);
    return id && type ? { id, type, resource: obj(j.resource) } : null;
  } catch {
    return null;
  }
}

/** `supplementary_data.related_ids` names the order / authorization / capture a payment event belongs to. */
function relatedIds(resource: Json): { orderId?: string; authorizationId?: string; captureId?: string } {
  const r = obj(obj(resource.supplementary_data).related_ids);
  const out: { orderId?: string; authorizationId?: string; captureId?: string } = {};
  const o = str(r.order_id);
  const a = str(r.authorization_id);
  const c = str(r.capture_id);
  if (o) out.orderId = o;
  if (a) out.authorizationId = a;
  if (c) out.captureId = c;
  return out;
}

/** A refund event's resource is the refund; the capture it belongs to is in its `up` link. */
function captureIdFromLinks(resource: Json): string | undefined {
  const links = Array.isArray(resource.links) ? resource.links : [];
  for (const l of links) {
    const link = obj(l);
    if (link.rel !== 'up') continue;
    const m = /\/v2\/payments\/captures\/([^/?#]+)/.exec(str(link.href) ?? '');
    if (m?.[1]) return m[1];
  }
  return undefined;
}

type Result = Omit<WebhookOutcome, 'eventId' | 'eventType'>;
const result = (action: WebhookAction, detail: string, orderId: string | null = null, followUps: WebhookFollowUp[] = []): Result => ({
  action,
  detail,
  orderId,
  followUps,
});

async function note(ctx: PayPalContext, ev: WebhookEventRow, type: string, orderId: string | null, payload: Json): Promise<void> {
  await withTx(
    (tx) =>
      appendAudit(tx, {
        actor: 'system:webhook',
        type,
        entity: orderId ? 'purchase_order' : 'webhook_event',
        entityId: orderId ?? ev.eventId,
        payload: { eventId: ev.eventId, eventType: ev.eventType, ...payload },
      }),
    ctx.db,
  );
}

const unlinked = async (ctx: PayPalContext, ev: WebhookEventRow, refs: Json): Promise<Result> => {
  await note(ctx, ev, 'WEBHOOK_UNLINKED', null, { refs });
  return result('UNLINKED', 'no order of ours carries the PayPal id this event names');
};

const mismatch = async (ctx: PayPalContext, ev: WebhookEventRow, orderId: string, payload: Json): Promise<Result> => {
  await note(ctx, ev, 'WEBHOOK_STATE_MISMATCH', orderId, payload);
  return result('ALERT', String(payload.reason), orderId);
};

const payments = (ctx: PayPalContext) => new PaymentsController(ctx.sdk());

async function getCapture(ctx: PayPalContext, orderRowId: string, captureId: string): Promise<CapturedPayment> {
  const res = await paypalCall<CapturedPayment>({
    db: ctx.db,
    action: 'get',
    orderRowId,
    write: false,
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: () => payments(ctx).getCapturedPayment({ captureId }),
  });
  return res.result;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Handlers
 * ---------------------------------------------------------------------------------------------------------------- */

/** CHECKOUT.ORDER.APPROVED, and PAYMENT.AUTHORIZATION.CREATED: the backstop for an `onApprove` that never reached us. */
async function onApproval(ctx: PayPalContext, ev: WebhookEventRow, refs: { paypalOrderId?: string; authorizationId?: string }): Promise<Result> {
  const orderId = await findOrderIdByPayPalRef(ctx.db, refs);
  if (!orderId) return unlinked(ctx, ev, refs);
  const order = (await getOrder(ctx.db, orderId))!;
  if (order.state !== 'AWAITING_APPROVAL') return result('NOOP', `order is already ${order.state}`, orderId);
  if (!order.paypalOrderId) return result('NOOP', 'order has no PayPal order id yet', orderId);
  try {
    await authorizeHold(ctx, orderId, order.paypalOrderId);
  } catch (err) {
    // authorizeHold asks PayPal; PayPal saying "not approved" overrules the event.
    if (err instanceof DomainError && err.code === 'ORDER_NOT_APPROVED') return result('NOOP', 'PayPal reports the order is not approved', orderId);
    if (err instanceof DomainError && err.code === 'INSTRUMENT_DECLINED') return result('NOOP', 'PayPal declined the funding source; the buyer must choose another', orderId);
    if (err instanceof DomainError && err.code === 'BAD_STATE') return result('NOOP', err.message, orderId);
    throw err;
  }
  return result('APPLIED', 'authorized the hold', orderId);
}

async function onAuthorizationVoided(ctx: PayPalContext, ev: WebhookEventRow, p: ParsedEvent): Promise<Result> {
  const authorizationId = str(p.resource.id);
  if (!authorizationId) return result('IGNORED', 'authorization event without an id');
  const orderId = await findOrderIdByPayPalRef(ctx.db, { authorizationId });
  if (!orderId) return unlinked(ctx, ev, { authorizationId });
  const order = (await getOrder(ctx.db, orderId))!;
  // Reauthorization voids the old authorization at PayPal, so a VOIDED event for a superseded id is expected and harmless.
  if (order.authorizationId !== authorizationId) return result('NOOP', 'authorization was superseded by a reauthorization', orderId);
  if (order.state === 'VOIDED') return result('NOOP', 'order is already VOIDED', orderId);

  const live = await getAuthorization(ctx, orderId, authorizationId);
  if (live.status !== 'VOIDED') return result('NOOP', `PayPal reports the authorization as ${String(live.status)}`, orderId);

  if (order.state !== 'HELD' && order.state !== 'IN_TRANSIT') {
    if (order.captureId || order.state === 'SETTLED') return result('NOOP', `order is ${order.state}; the void is moot`, orderId);
    return mismatch(ctx, ev, orderId, { reason: `PayPal voided the authorization but the order is ${order.state}`, authorizationId, state: order.state });
  }
  return withTx(async (tx) => {
    const r = await transition(tx, orderId, ['HELD', 'IN_TRANSIT'], 'VOIDED');
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while its void was being recorded');
    if (r === 'ALREADY_THERE') return result('NOOP', 'order is already VOIDED', orderId);
    await appendAudit(tx, {
      actor: 'system:webhook',
      type: 'HOLD_VOIDED_AT_PAYPAL',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { eventId: ev.eventId, authorizationId, previousState: order.state, amountMinor: order.amountMinor.toString() },
    });
    return result('APPLIED', 'recorded the void PayPal made', orderId);
  }, ctx.db);
}

async function onCaptureCompleted(ctx: PayPalContext, ev: WebhookEventRow, p: ParsedEvent): Promise<Result> {
  const captureId = str(p.resource.id);
  if (!captureId) return result('IGNORED', 'capture event without an id');
  const rel = relatedIds(p.resource);
  // The event can beat our own capture() to the database, in which case no capture id is stored yet.
  const orderId = await findOrderIdByPayPalRef(ctx.db, {
    captureId,
    ...(rel.authorizationId ? { authorizationId: rel.authorizationId } : {}),
    ...(rel.orderId ? { paypalOrderId: rel.orderId } : {}),
  });
  if (!orderId) return unlinked(ctx, ev, { captureId, ...rel });
  const order = (await getOrder(ctx.db, orderId))!;
  if (order.captureId && order.captureId !== captureId) {
    return mismatch(ctx, ev, orderId, { reason: `order already has capture ${order.captureId}; PayPal reports ${captureId}`, captureId });
  }
  if (order.captureId === captureId) return result('NOOP', `capture already recorded (order is ${order.state})`, orderId);

  const live = await getCapture(ctx, orderId, captureId);
  if (live.status !== 'COMPLETED') return result('NOOP', `PayPal reports the capture as ${String(live.status)}`, orderId);
  if (order.state !== 'DELIVERED') {
    // Money moved at PayPal without the proof gate having passed here (for example a capture made in PayPal's own dashboard).
    return mismatch(ctx, ev, orderId, { reason: `capture ${captureId} completed at PayPal but the order is ${order.state}, not DELIVERED`, captureId, state: order.state });
  }
  if (live.amount && (live.amount.value !== usd.toPayPal(order.amountMinor) || live.amount.currencyCode !== 'USD')) {
    return mismatch(ctx, ev, orderId, {
      reason: `capture amount ${live.amount.value} ${live.amount.currencyCode} != ${usd.toPayPal(order.amountMinor)} USD`,
      captureId,
    });
  }

  const f = await getFulfillment(ctx.db, orderId);
  return withTx(async (tx) => {
    const r = await transition(tx, orderId, ['DELIVERED'], 'SETTLED', { captureId });
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while its capture was being recorded');
    if (r === 'ALREADY_THERE') return result('NOOP', 'order is already SETTLED', orderId);
    // Same audit type capture() writes, so the order has exactly one CAPTURED row whichever of the two got here first.
    await appendAudit(tx, {
      actor: 'system:webhook',
      type: 'CAPTURED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: {
        source: 'WEBHOOK',
        eventId: ev.eventId,
        captureId,
        authorizationId: order.authorizationId,
        amountMinor: order.amountMinor.toString(),
        carrier: f?.carrier ?? null,
        trackingNumber: f?.trackingNumber ?? null,
        deliveredAt: f?.deliveredAt?.toISOString() ?? null,
        fulfillmentSource: f?.source ?? null,
      },
    });
    const followUps: WebhookFollowUp[] = f && !f.pushedToPaypalAt ? [{ job: 'tracking.push', orderId, captureId }] : [];
    return result('APPLIED', 'recorded the capture', orderId, followUps);
  }, ctx.db);
}

const CAPTURE_REFUSED = new Set(['DECLINED', 'DENIED', 'FAILED']);

async function onCaptureDenied(ctx: PayPalContext, ev: WebhookEventRow, p: ParsedEvent): Promise<Result> {
  const captureId = str(p.resource.id);
  if (!captureId) return result('IGNORED', 'capture event without an id');
  const rel = relatedIds(p.resource);
  const orderId = await findOrderIdByPayPalRef(ctx.db, {
    captureId,
    ...(rel.authorizationId ? { authorizationId: rel.authorizationId } : {}),
    ...(rel.orderId ? { paypalOrderId: rel.orderId } : {}),
  });
  if (!orderId) return unlinked(ctx, ev, { captureId, ...rel });
  const order = (await getOrder(ctx.db, orderId))!;
  if (order.state === 'FAILED') return result('NOOP', 'order is already FAILED', orderId);

  const live = await getCapture(ctx, orderId, captureId);
  if (!live.status || !CAPTURE_REFUSED.has(live.status)) return result('NOOP', `PayPal reports the capture as ${String(live.status)}`, orderId);
  if (order.state !== 'DELIVERED') {
    return mismatch(ctx, ev, orderId, { reason: `capture ${captureId} was refused by PayPal but the order is ${order.state}, not DELIVERED`, captureId, state: order.state });
  }
  return withTx(async (tx) => {
    const r = await transition(tx, orderId, ['DELIVERED'], 'FAILED');
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while its refused capture was being recorded');
    if (r === 'ALREADY_THERE') return result('NOOP', 'order is already FAILED', orderId);
    await appendAudit(tx, {
      actor: 'system:webhook',
      type: 'CAPTURE_FAILED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { source: 'WEBHOOK', eventId: ev.eventId, captureId, paypalStatus: live.status },
    });
    return result('APPLIED', 'recorded the refused capture', orderId);
  }, ctx.db);
}

async function onCaptureRefunded(ctx: PayPalContext, ev: WebhookEventRow, p: ParsedEvent): Promise<Result> {
  const refundId = str(p.resource.id);
  const rel = relatedIds(p.resource);
  const captureId = captureIdFromLinks(p.resource) ?? rel.captureId;
  if (!captureId) return result('IGNORED', 'refund event does not name its capture');
  const orderId = await findOrderIdByPayPalRef(ctx.db, { captureId });
  if (!orderId) return unlinked(ctx, ev, { captureId, refundId: refundId ?? null });

  let applied = false;
  // A refund we made that is still PENDING settles through the one path that also audits it.
  if (refundId) {
    const row = await getRefundRow(ctx.db, refundId);
    if (row?.status === 'PENDING') applied = (await reconcileRefund(ctx, refundId)) !== null;
  }

  const order = (await getOrder(ctx.db, orderId))!;
  if (order.state === 'REFUNDED') return result(applied ? 'APPLIED' : 'NOOP', 'order is REFUNDED', orderId);
  const live = await getCapture(ctx, orderId, captureId);
  if (live.status !== 'REFUNDED') {
    return result(applied ? 'APPLIED' : 'NOOP', `PayPal reports the capture as ${String(live.status)}; the order stays ${order.state}`, orderId);
  }
  if (order.state !== 'SETTLED' && order.state !== 'DISPUTED') {
    return mismatch(ctx, ev, orderId, { reason: `capture ${captureId} is fully refunded at PayPal but the order is ${order.state}`, captureId, state: order.state });
  }
  return withTx(async (tx) => {
    const r = await transition(tx, orderId, ['SETTLED', 'DISPUTED'], 'REFUNDED');
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while its refund was being recorded');
    if (r === 'ALREADY_THERE') return result('NOOP', 'order is already REFUNDED', orderId);
    await appendAudit(tx, {
      actor: 'system:webhook',
      type: 'REFUND_OBSERVED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { eventId: ev.eventId, captureId, refundId: refundId ?? null, previousState: order.state },
    });
    return result('APPLIED', 'recorded the full refund', orderId);
  }, ctx.db);
}

async function onDispute(ctx: PayPalContext, p: ParsedEvent): Promise<Result> {
  const disputeId = str(p.resource.dispute_id) ?? str(p.resource.id);
  if (!disputeId) return result('IGNORED', 'dispute event without a dispute id');
  const s = await syncDispute(ctx, disputeId);
  return result(s.changed ? 'APPLIED' : 'NOOP', s.changed ? `dispute ${disputeId} synced` : `dispute ${disputeId} unchanged`, s.orderId);
}

/**
 * Handle one verified event. Throws on anything worth retrying (a PayPal outage, a lost race); returns an outcome for
 * everything else, including events it deliberately does nothing with. Refuses an event that was not verified.
 */
export async function processWebhookEvent(ctx: PayPalContext, ev: WebhookEventRow): Promise<WebhookOutcome> {
  if (ev.verified !== 'POSTBACK' && ev.verified !== 'OFFLINE') {
    throw new DomainError('INTERNAL', `refusing to process event ${ev.eventId}: its signature is not verified (${String(ev.verified)})`);
  }
  const base = { eventId: ev.eventId, eventType: ev.eventType };
  const p = parseEvent(ev.rawBody);
  if (!p) return { ...base, ...result('IGNORED', 'body is not a PayPal event') };
  if (p.id !== ev.eventId || p.type !== ev.eventType) return { ...base, ...result('IGNORED', 'event id or type differs from what was recorded') };

  const rel = relatedIds(p.resource);
  let r: Result;
  switch (p.type) {
    case 'CHECKOUT.ORDER.APPROVED': {
      const id = str(p.resource.id);
      r = id ? await onApproval(ctx, ev, { paypalOrderId: id }) : result('IGNORED', 'order event without an id');
      break;
    }
    case 'PAYMENT.AUTHORIZATION.CREATED': {
      const authorizationId = str(p.resource.id);
      r = await onApproval(ctx, ev, {
        ...(authorizationId ? { authorizationId } : {}),
        ...(rel.orderId ? { paypalOrderId: rel.orderId } : {}),
      });
      break;
    }
    case 'PAYMENT.AUTHORIZATION.VOIDED':
      r = await onAuthorizationVoided(ctx, ev, p);
      break;
    case 'PAYMENT.CAPTURE.COMPLETED':
      r = await onCaptureCompleted(ctx, ev, p);
      break;
    case 'PAYMENT.CAPTURE.DENIED':
      r = await onCaptureDenied(ctx, ev, p);
      break;
    case 'PAYMENT.CAPTURE.REFUNDED':
      r = await onCaptureRefunded(ctx, ev, p);
      break;
    case 'CUSTOMER.DISPUTE.CREATED':
    case 'CUSTOMER.DISPUTE.UPDATED':
    case 'CUSTOMER.DISPUTE.RESOLVED':
      r = await onDispute(ctx, p);
      break;
    default:
      r = result('IGNORED', `${p.type} is not an event this product acts on`);
  }
  return { ...base, ...r };
}
