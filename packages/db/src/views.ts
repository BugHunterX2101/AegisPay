import type { OrderState } from '@aegis/core';
import type { AuditRow } from './audit.ts';
import type { Queryable } from './pool.ts';

/** One row of the operator's grid: an order with the proposal, mandate, carrier record and dispute it belongs to. */
export interface OrderGridRow {
  id: string;
  state: OrderState;
  amountMinor: bigint;
  currency: string;
  mandateId: string;
  mandateVersion: number;
  deliverBy: string; // 'YYYY-MM-DD'
  title: string | null;
  domain: string | null;
  quantity: number | null;
  unitPriceMinor: bigint | null;
  gatePass: boolean | null;
  decisionSha256: string | null;
  paypalOrderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  authExpiresAt: Date | null;
  honorEndsAt: Date | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  fulfillmentSource: string | null;
  disputeId: string | null;
  disputeStatus: string | null;
  rowVersion: number;
  updatedAt: Date;
}

interface GridDbRow {
  id: string; state: OrderState; amount_minor: bigint; currency: string; mandate_id: string; mandate_version: number;
  deliver_by: string; title: string | null; domain: string | null; quantity: number | null;
  unit_price_minor: bigint | null; gate_pass: boolean | null; decision_sha256: string | null;
  paypal_order_id: string | null; authorization_id: string | null; capture_id: string | null;
  auth_expires_at: Date | null; honor_ends_at: Date | null; carrier: string | null; tracking_number: string | null;
  shipped_at: Date | null; delivered_at: Date | null; fulfillment_source: string | null;
  dispute_id: string | null; dispute_status: string | null; row_version: number; updated_at: Date;
}

const GRID_SELECT = `
  select o.id, o.state, o.amount_minor, o.currency, p.mandate_id, p.mandate_version, m.deliver_by,
         p.title, p.domain, p.quantity, p.unit_price_minor, p.gate_pass, p.decision_sha256,
         o.paypal_order_id, o.authorization_id, o.capture_id, o.auth_expires_at, o.honor_ends_at,
         f.carrier, f.tracking_number, f.shipped_at, f.delivered_at, f.source as fulfillment_source,
         d.paypal_dispute_id as dispute_id, d.status as dispute_status, o.row_version, o.updated_at
    from purchase_order o
    join proposal p on p.id = o.proposal_id
    join mandate m on m.id = p.mandate_id and m.version = p.mandate_version
    left join fulfillment f on f.order_id = o.id
    left join lateral (
      select paypal_dispute_id, status from dispute where order_id = o.id order by updated_at desc nulls last limit 1
    ) d on true`;

const toGrid = (r: GridDbRow): OrderGridRow => ({
  id: r.id, state: r.state, amountMinor: r.amount_minor, currency: r.currency.trim(), mandateId: r.mandate_id,
  mandateVersion: r.mandate_version, deliverBy: r.deliver_by, title: r.title, domain: r.domain, quantity: r.quantity,
  unitPriceMinor: r.unit_price_minor, gatePass: r.gate_pass, decisionSha256: r.decision_sha256,
  paypalOrderId: r.paypal_order_id, authorizationId: r.authorization_id, captureId: r.capture_id,
  authExpiresAt: r.auth_expires_at, honorEndsAt: r.honor_ends_at, carrier: r.carrier, trackingNumber: r.tracking_number,
  shippedAt: r.shipped_at, deliveredAt: r.delivered_at, fulfillmentSource: r.fulfillment_source,
  disputeId: r.dispute_id, disputeStatus: r.dispute_status, rowVersion: r.row_version, updatedAt: r.updated_at,
});

/** Newest first. The grid loads this once and is then fed by the stream, so the cap is a safety limit, not paging. */
export async function listOrderGrid(db: Queryable, limit = 500): Promise<OrderGridRow[]> {
  const r = await db.query<GridDbRow>(`${GRID_SELECT} order by o.updated_at desc, o.id desc limit $1`, [limit]);
  return r.rows.map(toGrid);
}

export async function getOrderGridRow(db: Queryable, id: string): Promise<OrderGridRow | null> {
  const r = await db.query<GridDbRow>(`${GRID_SELECT} where o.id = $1`, [id]);
  return r.rows[0] ? toGrid(r.rows[0]) : null;
}

interface AuditDbRow {
  seq: bigint; ts: string; actor: string; type: string; entity: string | null; entity_id: string | null;
  payload: unknown; paypal_request_id: string | null; paypal_debug_id: string | null; prev_hash: string; hash: string;
}

const AUDIT_COLUMNS = `seq, to_char(ts at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ts, actor, type, entity, entity_id,
  payload, paypal_request_id, paypal_debug_id, prev_hash, hash`;

const toAudit = (r: AuditDbRow): AuditRow => ({
  seq: r.seq, ts: r.ts, actor: r.actor, type: r.type, entity: r.entity, entityId: r.entity_id, payload: r.payload,
  paypalRequestId: r.paypal_request_id, paypalDebugId: r.paypal_debug_id, prevHash: r.prev_hash, hash: r.hash,
});

/** The audit trail of one entity (an order, a mandate, a dispute), oldest first: the detail grid and the evidence read this. */
export async function listAuditForEntity(db: Queryable, entityId: string, limit = 500): Promise<AuditRow[]> {
  const r = await db.query<AuditDbRow>(
    `select ${AUDIT_COLUMNS} from audit_event where entity_id = $1 order by seq limit $2`,
    [entityId, limit],
  );
  return r.rows.map(toAudit);
}

/** Events after `seq`, oldest first: how a reconnecting stream catches up from Last-Event-ID. */
export async function listAuditAfter(db: Queryable, seq: bigint, limit = 200): Promise<AuditRow[]> {
  const r = await db.query<AuditDbRow>(`select ${AUDIT_COLUMNS} from audit_event where seq > $1 order by seq limit $2`, [seq, limit]);
  return r.rows.map(toAudit);
}

/** The highest sequence number, or 0 when the log is empty. A new stream starts from here so it replays nothing. */
export async function auditHeadSeq(db: Queryable): Promise<bigint> {
  const r = await db.query<{ seq: bigint | null }>('select max(seq) as seq from audit_event');
  return r.rows[0]?.seq ?? 0n;
}
