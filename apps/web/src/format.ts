import { useSyncExternalStore } from 'react';
import { useStore } from './store.ts';
import type { OrderState } from './types.ts';

/** Minor units (a decimal string, as the API sends bigints) to a currency string. */
export function money(minor: string | null | undefined, currency = 'USD'): string {
  if (minor == null) return '';
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(Number(minor) / 10 ** digits);
}

export const STATE_LABEL: Record<OrderState, string> = {
  GATED: 'Gated', REJECTED: 'Rejected', AWAITING_APPROVAL: 'Awaiting approval', CANCELLED: 'Cancelled', HELD: 'Held',
  IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', SETTLED: 'Settled', FAILED: 'Failed', VOIDED: 'Voided',
  DISPUTED: 'Disputed', EVIDENCE_SUBMITTED: 'Evidence submitted', RESOLVED_WON: 'Won', RESOLVED_LOST: 'Lost', REFUNDED: 'Refunded',
};

/** Colour families from the product spec: red blocks or fails, blue waits on a human, amber is money on hold, green settled. */
export const STATE_TONE: Record<OrderState, 'red' | 'blue' | 'amber' | 'green' | 'grey'> = {
  GATED: 'blue', REJECTED: 'red', AWAITING_APPROVAL: 'blue', CANCELLED: 'grey', HELD: 'amber', IN_TRANSIT: 'amber',
  DELIVERED: 'green', SETTLED: 'green', FAILED: 'red', VOIDED: 'grey', DISPUTED: 'red', EVIDENCE_SUBMITTED: 'amber',
  RESOLVED_WON: 'green', RESOLVED_LOST: 'red', REFUNDED: 'grey',
};

// One interval for every countdown cell on the page, however many rows are showing.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let tick = Date.now();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  tick = Date.now();
  timer ??= setInterval(() => {
    tick = Date.now();
    listeners.forEach((l) => l());
  }, 1000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const DAY_MS = 86_400_000;

/** The app's own "now": the wall clock plus the Judge Mode time-travel offset, so a jump is visible in every timer. */
export function useAppNow(): number {
  const t = useSyncExternalStore(subscribe, () => tick);
  const offsetDays = useStore((s) => s.offsetDays);
  return t + offsetDays * DAY_MS;
}

export function remaining(toIso: string | null, now: number): { text: string; overdue: boolean } | null {
  if (!toIso) return null;
  const ms = new Date(toIso).getTime() - now;
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY_MS);
  const h = Math.floor((abs % DAY_MS) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
  return { text: ms < 0 ? `${text} over` : text, overdue: ms < 0 };
}

/** `YYYY-MM-DD` deliver-by dates are the end of that day, UTC. */
export const endOfDay = (ymd: string): string => `${ymd}T23:59:59.999Z`;

export const shortHash = (h: string | null | undefined): string => (h ? `${h.slice(0, 8)}…` : '');

/** The three money figures, shared by the hero and the grid totals so they can never disagree. */
export const HELD_STATES: readonly OrderState[] = ['HELD', 'IN_TRANSIT', 'DELIVERED'];
export const CAPTURED_STATES: readonly OrderState[] = ['SETTLED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'RESOLVED_WON'];
export const VOIDED_STATES: readonly OrderState[] = ['VOIDED'];

/** Exact sum (BigInt, no float drift) of the orders in `states`, formatted in the first row's currency. */
export function sumMinor(rows: ReadonlyArray<{ state: OrderState; amountMinor: string; currency: string }>, states: readonly OrderState[]): string {
  const total = rows.filter((r) => states.includes(r.state)).reduce((a, r) => a + BigInt(r.amountMinor), 0n);
  return money(total.toString(), rows[0]?.currency ?? 'USD');
}
