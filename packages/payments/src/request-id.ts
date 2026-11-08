import { DomainError, sha256Hex } from '@aegis/core';

/** Every PayPal write the module can make. The action is part of the idempotency key. */
export type PayPalAction =
  | 'create_order'
  | 'authorize'
  | 'capture'
  | 'void'
  | 'reauthorize'
  | 'refund'
  | 'track'
  | 'get'
  | 'verify_webhook'
  | 'simulate_event'
  | 'dispute_get'
  | 'dispute_evidence'
  | 'dispute_supporting_info';

/**
 * Deterministic `PayPal-Request-Id`: sha256(orderRowId:action:attempt), 64 hex chars (PayPal allows up to 108).
 *
 * Determinism is the point. A retry of the same logical operation re-sends the SAME id, so PayPal
 * replays the original result instead of executing twice. A genuinely new attempt (for example the
 * 2nd reauthorization) bumps `attempt` and so gets a new id. PayPal keeps request ids for 45 days.
 */
export function paypalRequestId(orderRowId: string, action: PayPalAction, attempt = 1): string {
  if (!orderRowId || orderRowId.includes(':')) {
    throw new DomainError('INTERNAL', 'orderRowId must be non-empty and must not contain ":"');
  }
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new DomainError('INTERNAL', `attempt must be a positive integer, got ${attempt}`);
  }
  return sha256Hex(`${orderRowId}:${action}:${attempt}`).slice(0, 64);
}
