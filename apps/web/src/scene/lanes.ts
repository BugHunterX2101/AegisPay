import type { OrderRow, OrderState } from '../types.ts';

/**
 * Where an order sits in the hold scene. Pure data with no three.js import, so the hero can label and count lanes
 * without pulling the 3D bundle into the first paint.
 *  - proposed: waiting on a human
 *  - held: money authorized in PayPal, not captured (DELIVERED stays here until the worker captures)
 *  - settled: captured, or a dispute won
 *  - gate: refused by the gatekeeper, failed, or in a dispute
 *  - released: the hold was voided, cancelled or refunded
 */
export type Lane = 'proposed' | 'held' | 'settled' | 'gate' | 'released';

export const LANES: readonly Lane[] = ['proposed', 'held', 'settled', 'gate', 'released'];

export const LANE_OF: Record<OrderState, Lane> = {
  GATED: 'proposed',
  AWAITING_APPROVAL: 'proposed',
  HELD: 'held',
  IN_TRANSIT: 'held',
  DELIVERED: 'held',
  SETTLED: 'settled',
  RESOLVED_WON: 'settled',
  DISPUTED: 'gate',
  EVIDENCE_SUBMITTED: 'gate',
  RESOLVED_LOST: 'gate',
  FAILED: 'gate',
  REJECTED: 'gate',
  VOIDED: 'released',
  CANCELLED: 'released',
  REFUNDED: 'released',
};

export const LANE_LABEL: Record<Lane, string> = {
  proposed: 'Awaiting approval',
  held: 'On hold',
  settled: 'Captured',
  gate: 'Blocked or disputed',
  released: 'Released',
};

export interface SceneOrder {
  id: string;
  state: OrderState;
  amountMinor: string;
}

export interface HoldScene {
  setOrders(orders: SceneOrder[]): void;
  pulse(kind: 'pass' | 'block' | 'webhook'): void;
  setPaused(paused: boolean): void;
  setVisible(visible: boolean): void;
  setReduced(reduced: boolean): void;
  refreshTheme(): void;
  dispose(): void;
}

export const sceneOrders = (orders: Record<string, OrderRow>): SceneOrder[] =>
  Object.values(orders).map((o) => ({ id: o.id, state: o.state, amountMinor: o.amountMinor }));

export function laneCounts(orders: Record<string, OrderRow>): Record<Lane, number> {
  const c: Record<Lane, number> = { proposed: 0, held: 0, settled: 0, gate: 0, released: 0 };
  for (const o of Object.values(orders)) c[LANE_OF[o.state]]++;
  return c;
}
