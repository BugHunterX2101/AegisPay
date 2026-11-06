import { DomainError, systemClock } from '@aegis/core';
import type { Clock } from '@aegis/core';
import { appendAudit } from './audit.ts';
import { uuidv7 } from './ids.ts';
import { getCurrentMandate, lockMandate, spentSoFar } from './mandates.ts';
import { getOrder, insertOrder, transition } from './orders.ts';
import type { OrderRow } from './orders.ts';
import type { Tx } from './pool.ts';
import { getOrderBundle, getProposalRecord } from './proposals.ts';

/**
 * The human-driven steps of an order's life that are plain database work: creating the order from a gated proposal,
 * recording shipment, recording delivery. Each is one transaction (guarded state change + audit row), so a click that
 * is repeated or races a webhook can never apply twice. Money calls live in @aegis/payments, not here.
 */

export interface CreatedOrder {
  order: OrderRow;
  /** False when the proposal already had an order: the call returns it unchanged (a double click is not an error). */
  created: boolean;
}

/**
 * Turn a proposal that PASSED the gate into an order awaiting the human's PayPal approval.
 *
 * The gate's verdict is not recomputed here (it is stored with the proposal, and createHold re-checks its hash). What
 * can change between the gate and the click is re-checked under the mandate's lock:
 *  - the mandate was amended (R2) or paused/closed/expired since,
 *  - another order used up the budget (R6): two passing proposals can each fit alone and not together.
 */
export async function createOrderFromProposal(
  tx: Tx,
  proposalId: string,
  opts: { actor: string; clock?: Clock },
): Promise<CreatedOrder> {
  const now = (opts.clock ?? systemClock).now();
  const proposal = await getProposalRecord(tx, proposalId);
  if (!proposal) throw new DomainError('NOT_FOUND', `Proposal ${proposalId} not found`);

  await lockMandate(tx, proposal.mandateId);

  const existing = await tx.query<{ id: string }>('select id from purchase_order where proposal_id = $1', [proposalId]);
  if (existing.rows[0]) {
    return { order: (await getOrder(tx, existing.rows[0].id))!, created: false };
  }

  if (proposal.gatePass !== true) throw new DomainError('GATE_FAILED', 'the proposal did not pass the gatekeeper');
  if (proposal.unitPriceMinor === null || proposal.quantity === null || proposal.shippingMinor === null || proposal.taxMinor === null || !proposal.decisionSha256) {
    throw new DomainError('VALIDATION', 'proposal is missing price, quantity, shipping, tax or decision hash');
  }
  const amount = proposal.unitPriceMinor * BigInt(proposal.quantity) + proposal.shippingMinor + proposal.taxMinor;

  const mandate = await getCurrentMandate(tx, proposal.mandateId, { forUpdate: true });
  if (!mandate) throw new DomainError('NOT_FOUND', `Mandate ${proposal.mandateId} not found`);
  if (mandate.version !== proposal.mandateVersion) {
    throw new DomainError('DECISION_STALE', `the mandate was amended to v${mandate.version} after this proposal was gated against v${proposal.mandateVersion}`, {
      details: [{ rule: 'R2', expected: `v${mandate.version}`, actual: `v${proposal.mandateVersion}` }],
    });
  }
  if (mandate.status !== 'ACTIVE') throw new DomainError('MANDATE_NOT_ACTIVE', `mandate v${mandate.version} is ${mandate.status}`);
  if (mandate.expiresAt <= now) throw new DomainError('MANDATE_NOT_ACTIVE', `mandate expired ${mandate.expiresAt.toISOString()}`);

  const spent = await spentSoFar(tx, mandate.id);
  if (spent + amount > mandate.budgetMinor) {
    throw new DomainError('GATE_FAILED', 'this order would exceed the mandate budget', {
      details: [{ rule: 'R6', expected: `<= ${mandate.budgetMinor}`, actual: (spent + amount).toString() }],
    });
  }

  const id = uuidv7();
  await insertOrder(tx, { id, proposalId, state: 'GATED', amountMinor: amount });
  await transition(tx, id, ['GATED'], 'AWAITING_APPROVAL');
  await appendAudit(tx, {
    actor: opts.actor,
    type: 'ORDER_CREATED',
    entity: 'purchase_order',
    entityId: id,
    payload: {
      proposalId,
      amountMinor: amount.toString(),
      decisionSha256: proposal.decisionSha256,
      mandateId: mandate.id,
      mandateVersion: mandate.version,
      mandateSha256: mandate.sha256,
      committedBeforeMinor: spent.toString(),
    },
  });
  return { order: (await getOrder(tx, id))!, created: true };
}

/**
 * AWAITING_APPROVAL -> CANCELLED: the human closed the PayPal popup (or gave up). Nothing was ever held, so no PayPal
 * call is needed; the unapproved PayPal order simply expires. Cancelling frees the budget the order was reserving.
 * An order that is already CANCELLED stays so; one past approval cannot be cancelled here (void it instead).
 */
export async function cancelUnapprovedOrder(tx: Tx, orderId: string, c: { actor: string; reason?: string }): Promise<{ applied: boolean; order: OrderRow }> {
  const res = await transition(tx, orderId, ['AWAITING_APPROVAL'], 'CANCELLED');
  if (res === 'CONFLICT') {
    const cur = await getOrder(tx, orderId);
    throw new DomainError('BAD_STATE', `Order is ${cur?.state ?? 'unknown'}, not AWAITING_APPROVAL`);
  }
  if (res === 'APPLIED') {
    await appendAudit(tx, {
      actor: c.actor,
      type: 'ORDER_CANCELLED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { reason: c.reason ?? 'approval cancelled' },
    });
  }
  return { applied: res === 'APPLIED', order: (await getOrder(tx, orderId))! };
}

/** Where a carrier record comes from. The sandbox has no real carrier, so every record says so. */
export const FULFILLMENT_SOURCE = 'SIMULATED';

export interface ShipmentInput {
  carrier: string;
  trackingNumber: string;
  actor: string;
  clock?: Clock;
}

/** HELD -> IN_TRANSIT with a carrier record. Repeating the call for an order already in transit changes nothing. */
export async function recordShipment(tx: Tx, orderId: string, s: ShipmentInput): Promise<{ applied: boolean; order: OrderRow }> {
  const now = (s.clock ?? systemClock).now();
  const res = await transition(tx, orderId, ['HELD'], 'IN_TRANSIT');
  if (res === 'CONFLICT') {
    const cur = await getOrder(tx, orderId);
    throw new DomainError('BAD_STATE', `Order is ${cur?.state ?? 'unknown'}, not HELD`);
  }
  if (res === 'APPLIED') {
    await tx.query(
      `insert into fulfillment (order_id, carrier, tracking_number, shipped_at, source) values ($1, $2, $3, $4, $5)`,
      [orderId, s.carrier, s.trackingNumber, now, FULFILLMENT_SOURCE],
    );
    await appendAudit(tx, {
      actor: s.actor,
      type: 'SHIPPED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { carrier: s.carrier, trackingNumber: s.trackingNumber, source: FULFILLMENT_SOURCE },
    });
  }
  return { applied: res === 'APPLIED', order: (await getOrder(tx, orderId))! };
}

/**
 * IN_TRANSIT -> DELIVERED, refused once the mandate's delivery date has passed (SLA_PASSED: the hold is for a human to
 * void, not to capture). Marked SIMULATED: nothing in the sandbox observes a real parcel. Repeating the call for an
 * order already DELIVERED changes nothing, and tells the caller so it can still make sure capture is queued.
 */
export async function recordDelivery(tx: Tx, orderId: string, d: { actor: string; clock?: Clock }): Promise<{ applied: boolean; order: OrderRow }> {
  const now = (d.clock ?? systemClock).now();
  const bundle = await getOrderBundle(tx, orderId);
  if (!bundle) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
  if (bundle.order.state === 'DELIVERED') return { applied: false, order: bundle.order };
  if (bundle.order.state !== 'IN_TRANSIT') throw new DomainError('BAD_STATE', `Order is ${bundle.order.state}, not IN_TRANSIT`);
  if (now.toISOString().slice(0, 10) > bundle.mandate.deliverBy) {
    throw new DomainError('SLA_PASSED', `delivery date ${bundle.mandate.deliverBy} has passed`, { details: { deliverBy: bundle.mandate.deliverBy } });
  }

  const res = await transition(tx, orderId, ['IN_TRANSIT'], 'DELIVERED');
  if (res === 'CONFLICT') {
    const cur = await getOrder(tx, orderId);
    throw new DomainError('BAD_STATE', `Order is ${cur?.state ?? 'unknown'}, not IN_TRANSIT`);
  }
  const f = await tx.query('update fulfillment set delivered_at = $2 where order_id = $1 and delivered_at is null', [orderId, now]);
  if (res === 'APPLIED') {
    if (f.rowCount !== 1) throw new DomainError('BAD_STATE', 'order is in transit but has no carrier record');
    await appendAudit(tx, {
      actor: d.actor,
      type: 'DELIVERED',
      entity: 'purchase_order',
      entityId: orderId,
      payload: { deliveredAt: now.toISOString(), source: FULFILLMENT_SOURCE },
    });
  }
  return { applied: res === 'APPLIED', order: (await getOrder(tx, orderId))! };
}
