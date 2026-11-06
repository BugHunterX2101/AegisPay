import type { Queryable, Tx } from './pool.ts';

export type RefundStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED';

export interface RefundRow {
  refundId: string;
  orderId: string;
  amountMinor: bigint;
  status: RefundStatus;
  reason: string;
  confirmedBy: string;
  createdAt: Date;
}

interface RefundDbRow {
  refund_id: string; order_id: string; amount_minor: bigint; status: RefundStatus;
  reason: string; confirmed_by: string; created_at: Date;
}

const toRefund = (r: RefundDbRow): RefundRow => ({
  refundId: r.refund_id,
  orderId: r.order_id,
  amountMinor: r.amount_minor,
  status: r.status,
  reason: r.reason,
  confirmedBy: r.confirmed_by,
  createdAt: r.created_at,
});

/**
 * Records a PayPal refund. Keyed by PayPal's refund id, so replaying the same refund (a retry after a lost response,
 * which PayPal answers with the original refund) updates the status instead of inserting twice.
 */
export async function insertRefund(
  tx: Tx,
  r: { refundId: string; orderId: string; amountMinor: bigint; status: RefundStatus; reason: string; confirmedBy: string },
): Promise<RefundRow> {
  const res = await tx.query<RefundDbRow>(
    `insert into refund (refund_id, order_id, amount_minor, status, reason, confirmed_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (refund_id) do update set status = excluded.status
     returning *`,
    [r.refundId, r.orderId, r.amountMinor, r.status, r.reason, r.confirmedBy],
  );
  return toRefund(res.rows[0]!);
}

export async function listRefunds(db: Queryable, orderId: string): Promise<RefundRow[]> {
  const r = await db.query<RefundDbRow>('select * from refund where order_id = $1 order by created_at, refund_id', [orderId]);
  return r.rows.map(toRefund);
}

/** Money already returned or on its way back: COMPLETED and PENDING refunds count, FAILED and CANCELLED do not. */
export async function refundedMinor(db: Queryable, orderId: string): Promise<bigint> {
  const r = await db.query<{ total: bigint }>(
    `select coalesce(sum(amount_minor), 0)::bigint as total from refund where order_id = $1 and status in ('COMPLETED', 'PENDING')`,
    [orderId],
  );
  return r.rows[0]!.total;
}
