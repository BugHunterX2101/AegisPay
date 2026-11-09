import { useSyncExternalStore } from 'react';
import { useStore } from './store.ts';
import type { OrderState } from './types.ts';

// Intl formatters are expensive to construct (locale data is resolved on every `new`) and cheap to reuse, so each one
// is built once. money() runs for every grid cell and every total on each render; it used to build a formatter per call.
const currencyFmt = new Map<string, { fmt: Intl.NumberFormat; scale: number }>();
function currencyFormatter(currency: string): { fmt: Intl.NumberFormat; scale: number } {
  let f = currencyFmt.get(currency);
  if (!f) {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    f = { fmt, scale: 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2) };
    currencyFmt.set(currency, f);
  }
  return f;
}
const DAY_FMT = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const STAMP_FMT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
const CLOCK_FMT = new Intl.DateTimeFormat('en-US', { timeStyle: 'medium' });

/** Minor units (a decimal string, as the API sends bigints) to a currency string. */
export function money(minor: string | null | undefined, currency = 'USD'): string {
  if (minor == null) return '';
  const { fmt, scale } = currencyFormatter(currency);
  return fmt.format(Number(minor) / scale);
}

export const STATE_LABEL: Record<OrderState, string> = {
  GATED: 'Gated', REJECTED: 'Rejected', AWAITING_APPROVAL: 'Awaiting approval', CANCELLED: 'Cancelled', HELD: 'Held',
  IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', SETTLED: 'Settled', FAILED: 'Failed', VOIDED: 'Voided',
  DISPUTED: 'Disputed', EVIDENCE_SUBMITTED: 'Evidence submitted', RESOLVED_WON: 'Won', RESOLVED_LOST: 'Lost', REFUNDED: 'Refunded',
};

/** `UNDER_REVIEW` to `Under review`: PayPal and the API speak in enum names; people should not have to. */
export const humanize = (s: string | null | undefined): string => {
  const t = (s ?? '').replaceAll('_', ' ').trim().toLowerCase();
  return t ? t[0]!.toUpperCase() + t.slice(1) : '';
};

/** A `YYYY-MM-DD` deliver-by date as a readable date. Read as UTC, so the day never shifts with the viewer's timezone. */
export const formatDay = (ymd: string | null | undefined): string => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : DAY_FMT.format(d);
};

/** A timestamp as `Nov 8, 2026, 12:58:54 AM`, in the viewer's timezone but one fixed language, like the money and dates. */
export const formatStamp = (iso: string | number | Date): string => STAMP_FMT.format(new Date(iso));

/** Just the time of day, for lines that sit under a date already (a drawer, a "checked at"). */
export const formatClock = (iso: string | number | Date): string => CLOCK_FMT.format(new Date(iso));

export const formatBytes =(n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** The tone families: red blocks or fails, blue waits on a human, amber is money on hold, green is verified, grey is closed. */
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

/** The real wall clock, ticking. PayPal's own timers (authorization expiry) run on this, whatever the demo clock says. */
export function useWallNow(): number {
  return useSyncExternalStore(subscribe, () => tick);
}

/** The app's own "now": the wall clock plus the Judge Mode time-travel offset, so a jump is visible in every timer. */
export function useAppNow(): number {
  const t = useWallNow();
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
