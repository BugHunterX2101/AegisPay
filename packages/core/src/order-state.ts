/**
 * The order state machine, encoded once. A unit test asserts this map matches the
 * Mermaid stateDiagram in docs/spec (Technical Documentation §Runtime flows #4).
 */
export const ORDER_STATES = [
  'GATED',
  'REJECTED',
  'AWAITING_APPROVAL',
  'CANCELLED',
  'HELD',
  'IN_TRANSIT',
  'DELIVERED',
  'SETTLED',
  'FAILED',
  'VOIDED',
  'DISPUTED',
  'EVIDENCE_SUBMITTED',
  'RESOLVED_WON',
  'RESOLVED_LOST',
  'REFUNDED',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const ALLOWED_TRANSITIONS: Readonly<Record<OrderState, readonly OrderState[]>> = {
  GATED: ['REJECTED', 'AWAITING_APPROVAL'],
  REJECTED: [],
  AWAITING_APPROVAL: ['HELD', 'CANCELLED'],
  CANCELLED: [],
  HELD: ['HELD', 'IN_TRANSIT', 'VOIDED'],
  IN_TRANSIT: ['DELIVERED', 'VOIDED'],
  DELIVERED: ['SETTLED', 'FAILED'],
  SETTLED: ['DISPUTED', 'REFUNDED'],
  FAILED: [],
  VOIDED: [],
  DISPUTED: ['EVIDENCE_SUBMITTED', 'REFUNDED'],
  EVIDENCE_SUBMITTED: ['RESOLVED_WON', 'RESOLVED_LOST'],
  RESOLVED_WON: [],
  RESOLVED_LOST: [],
  REFUNDED: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export const TERMINAL_STATES: readonly OrderState[] = ORDER_STATES.filter(
  (s) => ALLOWED_TRANSITIONS[s].length === 0,
);

/** States where PayPal money is held (authorized, not captured). */
export const HELD_STATES: readonly OrderState[] = ['HELD', 'IN_TRANSIT'];
/** States the 2-minute poller re-fetches from PayPal (webhook gap cover). */
export const OPEN_STATES: readonly OrderState[] = ['AWAITING_APPROVAL', 'HELD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'DISPUTED', 'EVIDENCE_SUBMITTED'];
