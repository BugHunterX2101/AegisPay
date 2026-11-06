import { DomainError, canTransition } from '@aegis/core';
import type { OrderState } from '@aegis/core';
import type { Queryable, Tx } from './pool.ts';

export interface OrderRow {
  id: string;
  proposalId: string;
  state: OrderState;
  amountMinor: bigint;
  currency: string;
  paypalOrderId: string | null;
  authorizationId: string | null;
  authorizationHistory: string[];
  captureId: string | null;
  authCreatedAt: Date | null;
  honorEndsAt: Date | null;
  authExpiresAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  payerId: string | null;
  rowVersion: number;
  updatedAt: Date;
}

interface OrderDbRow {
  id: string; proposal_id: string; state: OrderState; amount_minor: bigint; currency: string;
  paypal_order_id: string | null; authorization_id: string | null; authorization_history: string[];
  capture_id: string | null; auth_created_at: Date | null; honor_ends_at: Date | null;
  auth_expires_at: Date | null; approved_by: string | null; approved_at: Date | null;
  payer_id: string | null; row_version: number; updated_at: Date;
}

const toOrder = (r: OrderDbRow): OrderRow => ({
  id: r.id,
  proposalId: r.proposal_id,
  state: r.state,
  amountMinor: r.amount_minor,
  currency: r.currency.trim(),
  paypalOrderId: r.paypal_order_id,
  authorizationId: r.authorization_id,
  authorizationHistory: r.authorization_history,
  captureId: r.capture_id,
  authCreatedAt: r.auth_created_at,
  honorEndsAt: r.honor_ends_at,
  authExpiresAt: r.auth_expires_at,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  payerId: r.payer_id,
  rowVersion: r.row_version,
  updatedAt: r.updated_at,
});

export async function insertOrder(
  tx: Tx,
  o: { id: string; proposalId: string; state: OrderState; amountMinor: bigint; currency?: string },
): Promise<OrderRow> {
  const r = await tx.query<OrderDbRow>(
    `insert into purchase_order (id, proposal_id, state, amount_minor, currency)
     values ($1, $2, $3, $4, $5) returning *`,
    [o.id, o.proposalId, o.state, o.amountMinor, o.currency ?? 'USD'],
  );
  return toOrder(r.rows[0]!);
}

export async function getOrder(tx: Queryable, id: string, opts: { forUpdate?: boolean } = {}): Promise<OrderRow | null> {
  const r = await tx.query<OrderDbRow>(
    `select * from purchase_order where id = $1 ${opts.forUpdate ? 'for update' : ''}`,
    [id],
  );
  return r.rows[0] ? toOrder(r.rows[0]) : null;
}

/** Columns a transition may set. A closed whitelist: no caller-supplied SQL identifiers, ever. */
const PATCHABLE = {
  paypalOrderId: 'paypal_order_id',
  authorizationId: 'authorization_id',
  captureId: 'capture_id',
  authCreatedAt: 'auth_created_at',
  honorEndsAt: 'honor_ends_at',
  authExpiresAt: 'auth_expires_at',
  approvedBy: 'approved_by',
  approvedAt: 'approved_at',
  payerId: 'payer_id',
} as const;

export type OrderPatch = Partial<{ [K in keyof typeof PATCHABLE]: string | Date | null }> & {
  /** Append to authorization_history (reauthorize keeps every superseded authorization id). */
  appendAuthorizationId?: string;
};

export type TransitionResult = 'APPLIED' | 'ALREADY_THERE' | 'CONFLICT';

/**
 * The only way an order's state changes. One guarded UPDATE:
 *   UPDATE … WHERE id = $id AND state = ANY($from) [AND row_version = $v]
 * Under READ COMMITTED a concurrent writer that commits first makes the loser's WHERE re-evaluate
 * to false, so a webhook and a user click racing on the same order can never both apply.
 *  - APPLIED       this call moved the order.
 *  - ALREADY_THERE the order is already in `to` (a duplicate/late event): the caller no-ops.
 *  - CONFLICT      the order is in some other state (or the expected row_version moved): re-read.
 * Throws BAD_STATE if a `from → to` pair is not in the state machine (a programming error).
 */
export async function transition(
  tx: Tx,
  orderId: string,
  from: OrderState[],
  to: OrderState,
  patch: OrderPatch = {},
  opts: { expectedVersion?: number } = {},
): Promise<TransitionResult> {
  for (const f of from) {
    if (!canTransition(f, to)) throw new DomainError('BAD_STATE', `Illegal order transition ${f} → ${to}`);
  }

  const sets: string[] = ['state = $1', 'row_version = row_version + 1', 'updated_at = now()'];
  const params: unknown[] = [to, orderId, from];
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (key in patch) {
      params.push((patch as Record<string, unknown>)[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (patch.appendAuthorizationId !== undefined) {
    params.push(patch.appendAuthorizationId);
    sets.push(`authorization_history = array_append(authorization_history, $${params.length})`);
  }
  let where = 'id = $2 and state = any($3::text[])';
  if (opts.expectedVersion !== undefined) {
    params.push(opts.expectedVersion);
    where += ` and row_version = $${params.length}`;
  }

  const res = await tx.query(`update purchase_order set ${sets.join(', ')} where ${where}`, params);
  if (res.rowCount === 1) return 'APPLIED';

  const cur = await tx.query<{ state: OrderState }>('select state from purchase_order where id = $1', [orderId]);
  if (cur.rows.length === 0) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
  return cur.rows[0]!.state === to ? 'ALREADY_THERE' : 'CONFLICT';
}

/**
 * Stores the PayPal order id exactly once. `paypal_order_id IS NULL` makes it a compare-and-set: a second
 * createHold that raced past the first (PayPal's idempotent request id returns the same order id) is a no-op.
 * Returns the id now stored, so the caller can detect a genuine conflict (a *different* id already recorded).
 */
export async function recordPayPalOrderId(tx: Queryable, orderId: string, paypalOrderId: string): Promise<string> {
  await tx.query(
    `update purchase_order set paypal_order_id = $2, row_version = row_version + 1, updated_at = now()
      where id = $1 and paypal_order_id is null`,
    [orderId, paypalOrderId],
  );
  const r = await tx.query<{ paypal_order_id: string | null }>('select paypal_order_id from purchase_order where id = $1', [orderId]);
  if (r.rows.length === 0) throw new DomainError('NOT_FOUND', `Order ${orderId} not found`);
  return r.rows[0]!.paypal_order_id!;
}

export interface PayPalRefs {
  paypalOrderId?: string | null;
  authorizationId?: string | null;
  captureId?: string | null;
}

/**
 * Which of our orders a PayPal id belongs to. A webhook names PayPal ids only. The refs are tried most specific first
 * (capture, then authorization, then PayPal order); an authorization matches any id in authorization_history, so the
 * event for a superseded authorization still finds its order. Null when nothing matches.
 */
export async function findOrderIdByPayPalRef(db: Queryable, refs: PayPalRefs): Promise<string | null> {
  const lookups: Array<[string | null | undefined, string]> = [
    [refs.captureId, 'select id from purchase_order where capture_id = $1'],
    [refs.authorizationId, 'select id from purchase_order where $1 = any(authorization_history) or authorization_id = $1'],
    [refs.paypalOrderId, 'select id from purchase_order where paypal_order_id = $1'],
  ];
  for (const [ref, sql] of lookups) {
    if (!ref) continue;
    const r = await db.query<{ id: string }>(`${sql} limit 1`, [ref]);
    if (r.rows[0]) return r.rows[0].id;
  }
  return null;
}

/**
 * Reauthorization replaces the authorization id without changing the order state (HELD stays HELD, IN_TRANSIT stays
 * IN_TRANSIT), so it cannot go through `transition`. Guarded on state and on the id being replaced, so two racing
 * reauthorizations cannot both apply. The superseded id stays in authorization_history.
 */
export async function recordReauthorization(
  tx: Queryable,
  orderId: string,
  oldAuthorizationId: string,
  next: { authorizationId: string; authCreatedAt: Date; honorEndsAt: Date; authExpiresAt: Date },
): Promise<boolean> {
  const r = await tx.query(
    `update purchase_order
        set authorization_id = $3, auth_created_at = $4, honor_ends_at = $5, auth_expires_at = $6,
            authorization_history = array_append(authorization_history, $3),
            row_version = row_version + 1, updated_at = now()
      where id = $1 and authorization_id = $2 and state in ('HELD', 'IN_TRANSIT')`,
    [orderId, oldAuthorizationId, next.authorizationId, next.authCreatedAt, next.honorEndsAt, next.authExpiresAt],
  );
  return r.rowCount === 1;
}
