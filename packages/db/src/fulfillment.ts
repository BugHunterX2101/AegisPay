import type { Queryable } from './pool.ts';

export interface FulfillmentRow {
  orderId: string;
  carrier: string;
  trackingNumber: string;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  /** 'SIMULATED' in the sandbox (no real carrier); anything else must be labelled where it is shown. */
  source: string;
  pushedToPaypalAt: Date | null;
}

interface FulfillmentDbRow {
  order_id: string; carrier: string; tracking_number: string; shipped_at: Date | null;
  delivered_at: Date | null; source: string; pushed_to_paypal_at: Date | null;
}

/** Records that carrier + tracking reached PayPal. Only the first call sets the time; later calls are no-ops. */
export async function markTrackingPushed(db: Queryable, orderId: string, at: Date): Promise<boolean> {
  const r = await db.query(
    'update fulfillment set pushed_to_paypal_at = $2 where order_id = $1 and pushed_to_paypal_at is null',
    [orderId, at],
  );
  return r.rowCount === 1;
}

export async function getFulfillment(db: Queryable, orderId: string): Promise<FulfillmentRow | null> {
  const r = await db.query<FulfillmentDbRow>('select * from fulfillment where order_id = $1', [orderId]);
  const x = r.rows[0];
  return x
    ? {
        orderId: x.order_id, carrier: x.carrier, trackingNumber: x.tracking_number, shippedAt: x.shipped_at,
        deliveredAt: x.delivered_at, source: x.source, pushedToPaypalAt: x.pushed_to_paypal_at,
      }
    : null;
}
