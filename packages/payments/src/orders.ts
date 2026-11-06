import {
  CheckoutPaymentIntent,
  ItemCategory,
  OrdersController,
  PaypalExperienceUserAction,
  ShipmentCarrier,
} from '@paypal/paypal-server-sdk';
import type { Order, OrderRequest, OrderTrackerRequest } from '@paypal/paypal-server-sdk';
import { DomainError, usd } from '@aegis/core';
import type { Minor } from '@aegis/core';
import { appendAudit, getOrderBundle, recordPayPalOrderId, transition, withTx } from '@aegis/db';
import type { OrderBundle } from '@aegis/db';
import { hasIssue, paypalCall } from './call.ts';
import type { PayPalContext } from './client.ts';

/** PayPal honours an authorization for 3 days from creation (it stays valid, but un-guaranteed, for 29). */
export const HONOR_PERIOD_MS = 3 * 24 * 3_600_000;

/** Free text the LLM may write. It is length-capped here and never influences an amount. */
export interface HoldCopy {
  description: string;
}

export interface CreateHoldInput {
  orderRowId: string;
  /** The decision the caller believes authorised this order. It must match the one stored with the gated proposal. */
  decisionSha256: string;
  copy: HoldCopy;
  /** Public base URL of the app, for PayPal's return/cancel URLs. */
  appUrl: string;
  /** Optional cross-check against the caller's own total; the DB total is what is actually sent. */
  expectedTotal?: Minor;
}

export interface AuthorizedHold {
  authorizationId: string;
  expiresAt: Date;
  honorEndsAt: Date;
  payerId: string | null;
}

const orders = (ctx: PayPalContext) => new OrdersController(ctx.sdk());

const cap = (s: string, n: number) => s.slice(0, n);
const money = (m: Minor) => ({ currencyCode: 'USD', value: usd.toPayPal(m) });

/** What PayPal must be asked for, derived only from DB rows that already passed the gate. */
export interface HoldAmounts {
  unit: Minor;
  quantity: bigint;
  items: Minor;
  shipping: Minor;
  tax: Minor;
  total: Minor;
}

export function holdAmounts(b: OrderBundle): HoldAmounts {
  const p = b.proposal;
  if (p.unitPriceMinor === null || p.quantity === null || p.shippingMinor === null || p.taxMinor === null || !p.title) {
    throw new DomainError('VALIDATION', 'proposal is missing price, quantity, shipping, tax or title');
  }
  if (!Number.isInteger(p.quantity) || p.quantity < 1) throw new DomainError('VALIDATION', 'proposal quantity must be a positive integer');
  const quantity = BigInt(p.quantity);
  const items = p.unitPriceMinor * quantity;
  return { unit: p.unitPriceMinor, quantity, items, shipping: p.shippingMinor, tax: p.taxMinor, total: items + p.shippingMinor + p.taxMinor };
}

/**
 * `AEG-` + the last 12 hex digits of the order uuid. PayPal enforces invoice_id uniqueness per merchant, so this must
 * differ per order. Order ids are UUIDv7: the LEADING digits are a millisecond timestamp (identical for orders created
 * within ~a minute), the TRAILING digits are random. The test suite caught the first version, which used the prefix.
 */
export const invoiceIdFor = (orderRowId: string) => `AEG-${orderRowId.replace(/-/g, '').slice(-12).toUpperCase()}`;

export function buildOrderRequest(b: OrderBundle, a: HoldAmounts, copy: HoldCopy, appUrl: string): OrderRequest {
  const p = b.proposal;
  // PayPal requires item-level tax to agree with breakdown.tax_total when item tax is present. We send per-unit
  // tax only when the tax divides evenly across the quantity; otherwise we send tax_total alone.
  // (Sandbox contract test `sandbox.contract` confirms PayPal accepts both shapes.)
  const perUnitTax = a.tax > 0n && a.tax % a.quantity === 0n ? a.tax / a.quantity : undefined;
  return {
    intent: CheckoutPaymentIntent.Authorize,
    purchaseUnits: [
      {
        referenceId: p.id,
        customId: b.mandate.sha256,
        invoiceId: invoiceIdFor(b.order.id),
        description: cap(copy.description, 127),
        amount: {
          ...money(a.total),
          breakdown: {
            itemTotal: money(a.items),
            shipping: money(a.shipping),
            ...(a.tax > 0n ? { taxTotal: money(a.tax) } : {}),
          },
        },
        items: [
          {
            name: cap(p.title!, 127),
            ...(p.productId ? { sku: cap(p.productId, 127) } : {}),
            unitAmount: money(a.unit),
            ...(perUnitTax !== undefined ? { tax: money(perUnitTax) } : {}),
            quantity: a.quantity.toString(10),
            category: ItemCategory.PhysicalGoods,
          },
        ],
      },
    ],
    paymentSource: {
      paypal: {
        experienceContext: {
          returnUrl: `${appUrl.replace(/\/+$/, '')}/approved`,
          cancelUrl: `${appUrl.replace(/\/+$/, '')}/cancelled`,
          userAction: PaypalExperienceUserAction.Continue,
        },
      },
    },
  };
}

/**
 * Creates the authorization-hold order (`intent: AUTHORIZE`). Nothing the caller passes can change what PayPal is
 * asked for: amounts and line items come from the proposal and mandate rows in the DB, and the call is refused unless
 *  - the order is AWAITING_APPROVAL,
 *  - the proposal passed the gate and carries exactly `decisionSha256`,
 *  - the mandate version it was gated against is still ACTIVE,
 *  - the recomputed total equals the total stored with the order (AMOUNT_MISMATCH otherwise).
 * Idempotent: a second call for an order that already has a PayPal order id returns it without a network call.
 */
export async function createHold(ctx: PayPalContext, input: CreateHoldInput): Promise<{ paypalOrderId: string; reused: boolean }> {
  const bundle = await getOrderBundle(ctx.db, input.orderRowId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${input.orderRowId} not found`);
  const { order, proposal, mandate } = bundle;

  if (order.paypalOrderId) return { paypalOrderId: order.paypalOrderId, reused: true };
  if (order.state !== 'AWAITING_APPROVAL') throw new DomainError('BAD_STATE', `Order is ${order.state}, not AWAITING_APPROVAL`);
  if (proposal.gatePass !== true) throw new DomainError('GATE_FAILED', 'proposal did not pass the gatekeeper');
  if (!proposal.decisionSha256 || proposal.decisionSha256 !== input.decisionSha256) {
    throw new DomainError('DECISION_STALE', 'decision hash does not match the gated proposal');
  }
  if (mandate.status !== 'ACTIVE') throw new DomainError('MANDATE_NOT_ACTIVE', `mandate v${mandate.version} is ${mandate.status}`);
  if (order.currency !== 'USD' || mandate.currency !== 'USD') throw new DomainError('VALIDATION', 'only USD is supported');

  const amounts = holdAmounts(bundle);
  if (amounts.total !== order.amountMinor) {
    throw new DomainError('AMOUNT_MISMATCH', 'recomputed total differs from the gated order amount', {
      details: { recomputed: amounts.total.toString(), stored: order.amountMinor.toString() },
    });
  }
  if (input.expectedTotal !== undefined && input.expectedTotal !== amounts.total) {
    throw new DomainError('AMOUNT_MISMATCH', 'caller total differs from the gated order amount', {
      details: { caller: input.expectedTotal.toString(), stored: amounts.total.toString() },
    });
  }

  const body = buildOrderRequest(bundle, amounts, input.copy, input.appUrl);
  const res = await paypalCall<Order>({
    db: ctx.db,
    action: 'create_order',
    orderRowId: order.id,
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: ({ requestId }) => orders(ctx).createOrder({ body, paypalRequestId: requestId, prefer: 'return=representation' }),
  });

  const created = res.result;
  if (!created.id) throw new DomainError('PAYPAL_ERROR', 'PayPal createOrder returned no order id', { ...(res.debugId ? { paypalDebugId: res.debugId } : {}) });
  const echoed = created.purchaseUnits?.[0]?.amount?.value;
  if (echoed !== undefined && echoed !== usd.toPayPal(amounts.total)) {
    throw new DomainError('AMOUNT_MISMATCH', 'PayPal echoed a different amount than was requested', {
      details: { requested: usd.toPayPal(amounts.total), echoed },
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
    });
  }

  const stored = await withTx(async (tx) => {
    const id = await recordPayPalOrderId(tx, order.id, created.id!);
    await appendAudit(tx, {
      actor: 'system:payments',
      type: 'HOLD_CREATED',
      entity: 'purchase_order',
      entityId: order.id,
      paypalRequestId: res.requestId,
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
      payload: {
        paypalOrderId: created.id,
        status: created.status ?? null,
        totalMinor: amounts.total.toString(),
        mandateSha256: mandate.sha256,
        decisionSha256: proposal.decisionSha256,
        invoiceId: invoiceIdFor(order.id),
      },
    });
    return id;
  }, ctx.db);
  if (stored !== created.id) {
    throw new DomainError('CONCURRENT_UPDATE', 'another PayPal order id is already recorded for this order', {
      details: { stored, created: created.id },
    });
  }
  return { paypalOrderId: stored, reused: false };
}

/** Read the PayPal order (used by the poller and by recovery paths). Not a write: no kill switch, no idempotency key. */
export async function getPayPalOrder(ctx: PayPalContext, orderRowId: string, paypalOrderId: string): Promise<Order> {
  const res = await paypalCall<Order>({
    db: ctx.db,
    action: 'get',
    orderRowId,
    write: false,
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: () => orders(ctx).getOrder({ id: paypalOrderId }),
  });
  return res.result;
}

function pickAuthorization(o: Order) {
  const a = o.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  if (!a?.id || !a.createTime || !a.expirationTime) {
    throw new DomainError('PAYPAL_ERROR', 'PayPal order has no complete authorization (id, create_time, expiration_time)');
  }
  return { id: a.id, status: a.status, amount: a.amount, createTime: a.createTime, expirationTime: a.expirationTime };
}

/**
 * After the human approved in the PayPal popup, authorize the order server-side and move the order to HELD.
 * The authorization PayPal reports must be CREATED/PENDING and for exactly the gated amount, or nothing is recorded.
 * Idempotent: an already-HELD order returns the stored authorization; an order PayPal says is already authorized
 * (ORDER_ALREADY_AUTHORIZED) is recovered from a fresh GET instead of failing.
 */
export async function authorizeHold(
  ctx: PayPalContext,
  orderRowId: string,
  paypalOrderId: string,
  opts: { approvedBy?: string } = {},
): Promise<AuthorizedHold> {
  const bundle = await getOrderBundle(ctx.db, orderRowId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${orderRowId} not found`);
  const { order } = bundle;
  if (order.paypalOrderId !== paypalOrderId) {
    throw new DomainError('VALIDATION', 'PayPal order id does not belong to this order');
  }
  if (order.state === 'HELD' && order.authorizationId && order.authExpiresAt && order.honorEndsAt) {
    return { authorizationId: order.authorizationId, expiresAt: order.authExpiresAt, honorEndsAt: order.honorEndsAt, payerId: order.payerId };
  }
  if (order.state !== 'AWAITING_APPROVAL') throw new DomainError('BAD_STATE', `Order is ${order.state}, not AWAITING_APPROVAL`);

  let authorized: Order;
  let requestId: string | undefined;
  let debugId: string | undefined;
  try {
    const res = await paypalCall<Order>({
      db: ctx.db,
      action: 'authorize',
      orderRowId,
      ...(ctx.deps ? { deps: ctx.deps } : {}),
      onUnauthorized: () => ctx.handleUnauthorized(),
      run: ({ requestId: rid }) => orders(ctx).authorizeOrder({ id: paypalOrderId, paypalRequestId: rid, prefer: 'return=representation' }),
    });
    authorized = res.result;
    requestId = res.requestId;
    debugId = res.debugId;
  } catch (err) {
    if (err instanceof DomainError && err.code === 'PAYPAL_ERROR') {
      if (hasIssue(err, 'ORDER_NOT_APPROVED')) {
        throw new DomainError('ORDER_NOT_APPROVED', 'the buyer has not approved this PayPal order yet', {
          ...(err.paypalDebugId ? { paypalDebugId: err.paypalDebugId } : {}),
          paypalName: 'ORDER_NOT_APPROVED',
        });
      }
      if (hasIssue(err, 'ORDER_ALREADY_AUTHORIZED')) {
        authorized = await getPayPalOrder(ctx, orderRowId, paypalOrderId);
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const auth = pickAuthorization(authorized);
  if (auth.status !== 'CREATED' && auth.status !== 'PENDING') {
    throw new DomainError('PAYPAL_ERROR', `authorization is ${String(auth.status)}, expected CREATED or PENDING`, {
      ...(debugId ? { paypalDebugId: debugId } : {}),
    });
  }
  if (auth.amount && (auth.amount.value !== usd.toPayPal(order.amountMinor) || auth.amount.currencyCode !== 'USD')) {
    throw new DomainError('AMOUNT_MISMATCH', 'PayPal authorized a different amount than the gated order', {
      details: { authorized: auth.amount, stored: order.amountMinor.toString() },
      ...(debugId ? { paypalDebugId: debugId } : {}),
    });
  }

  const createdAt = new Date(auth.createTime);
  const result: AuthorizedHold = {
    authorizationId: auth.id,
    expiresAt: new Date(auth.expirationTime),
    honorEndsAt: new Date(createdAt.getTime() + HONOR_PERIOD_MS),
    payerId: authorized.payer?.payerId ?? null,
  };

  await withTx(async (tx) => {
    const r = await transition(tx, orderRowId, ['AWAITING_APPROVAL'], 'HELD', {
      authorizationId: result.authorizationId,
      authCreatedAt: createdAt,
      honorEndsAt: result.honorEndsAt,
      authExpiresAt: result.expiresAt,
      payerId: result.payerId,
      approvedBy: opts.approvedBy ?? null,
      approvedAt: ctx.clock.now(),
      appendAuthorizationId: result.authorizationId,
    });
    if (r === 'CONFLICT') throw new DomainError('CONCURRENT_UPDATE', 'order changed state while the hold was being authorized');
    if (r === 'ALREADY_THERE') return;
    await appendAudit(tx, {
      actor: opts.approvedBy ? `user:${opts.approvedBy}` : 'system:payments',
      type: 'HOLD_AUTHORIZED',
      entity: 'purchase_order',
      entityId: orderRowId,
      ...(requestId ? { paypalRequestId: requestId } : {}),
      ...(debugId ? { paypalDebugId: debugId } : {}),
      payload: {
        paypalOrderId,
        authorizationId: result.authorizationId,
        amountMinor: order.amountMinor.toString(),
        expiresAt: result.expiresAt.toISOString(),
        honorEndsAt: result.honorEndsAt.toISOString(),
        payerId: result.payerId,
      },
    });
  }, ctx.db);
  return result;
}

export interface TrackingInput {
  captureId: string;
  carrier: string;
  trackingNumber: string;
  items?: { name: string; quantity: number; sku?: string }[];
}

const CARRIERS = new Set<string>(Object.values(ShipmentCarrier));

/**
 * Pushes carrier + tracking number to PayPal after capture (Orders v2 tracking requires a capture id).
 * The carrier must be one PayPal knows; free text is refused rather than silently sent as "OTHER".
 * PayPal's tracking endpoint takes no PayPal-Request-Id, so the request id from the wrapper is unused here.
 */
export async function pushTracking(ctx: PayPalContext, orderRowId: string, paypalOrderId: string, t: TrackingInput): Promise<void> {
  if (!CARRIERS.has(t.carrier)) throw new DomainError('CARRIER_UNKNOWN', `"${t.carrier}" is not a PayPal-recognised carrier`);
  if (!t.trackingNumber.trim()) throw new DomainError('VALIDATION', 'trackingNumber is required');
  const body: OrderTrackerRequest = {
    captureId: t.captureId,
    trackingNumber: t.trackingNumber,
    carrier: t.carrier as ShipmentCarrier,
    notifyPayer: false,
    ...(t.items?.length
      ? { items: t.items.map((i) => ({ name: cap(i.name, 127), quantity: String(i.quantity), ...(i.sku ? { sku: i.sku } : {}) })) }
      : {}),
  };
  await paypalCall<Order>({
    db: ctx.db,
    action: 'track',
    orderRowId,
    ...(ctx.deps ? { deps: ctx.deps } : {}),
    onUnauthorized: () => ctx.handleUnauthorized(),
    run: () => orders(ctx).createOrderTracking({ id: paypalOrderId, body }),
  });
}
