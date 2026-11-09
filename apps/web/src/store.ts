import { create } from 'zustand';
import type { Dispute, FeedItem, OrderRow, SelfCheck, Session } from './types.ts';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting';

interface Toast { id: number; kind: 'ok' | 'error'; text: string }

interface AppState {
  session: Session | null;
  orders: Record<string, OrderRow>;
  disputes: Record<string, Dispute>;
  feed: FeedItem[];
  selfcheck: SelfCheck | null;
  stream: StreamStatus;
  offsetDays: number;
  drawerOpen: boolean;
  evidenceFor: string | null; // paypalDisputeId whose evidence modal is open
  toasts: Toast[];
  setSession: (s: Session) => void;
  setOrders: (rows: OrderRow[]) => void;
  upsertOrder: (row: OrderRow) => void;
  setDisputes: (rows: Dispute[]) => void;
  upsertDispute: (d: Dispute) => void;
  pushFeed: (item: FeedItem) => void;
  /** Everything the live stream delivered since the last frame, applied as one store update (useStream batches). */
  applyStream: (batch: StreamBatch) => void;
  setSelfcheck: (s: SelfCheck) => void;
  setStream: (s: StreamStatus) => void;
  setOffsetDays: (n: number) => void;
  setDrawer: (open: boolean) => void;
  openEvidence: (id: string | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
}

export interface StreamBatch {
  orders: OrderRow[];
  disputes: Dispute[];
  /** Oldest first, as delivered. */
  feed: FeedItem[];
}

const FEED_MAX = 200;
const DRAWER_HASH = '#activity';
const DISPUTE_HASH = '#dispute/';

function disputeFromHash(): string | null {
  const h = window.location.hash;
  if (!h.startsWith(DISPUTE_HASH)) return null;
  try {
    return decodeURIComponent(h.slice(DISPUTE_HASH.length)) || null;
  } catch {
    return null; // a malformed escape in a pasted link: ignore it rather than throw during module load
  }
}
let toastSeq = 0;

export const useStore = create<AppState>((set) => ({
  session: null,
  orders: {},
  disputes: {},
  feed: [],
  selfcheck: null,
  stream: 'connecting',
  offsetDays: 0,
  drawerOpen: window.location.hash === DRAWER_HASH,
  evidenceFor: disputeFromHash(),
  toasts: [],
  setSession: (session) => set({ session }),
  setOrders: (rows) => set({ orders: Object.fromEntries(rows.map((r) => [r.id, r])) }),
  // rowVersion only ever grows: an older upsert replayed after a reconnect must not overwrite newer state
  upsertOrder: (row) =>
    set((s) => {
      const cur = s.orders[row.id];
      return cur && cur.rowVersion > row.rowVersion ? s : { orders: { ...s.orders, [row.id]: row } };
    }),
  setDisputes: (rows) => set({ disputes: Object.fromEntries(rows.map((d) => [d.paypalDisputeId, d])) }),
  upsertDispute: (d) => set((s) => ({ disputes: { ...s.disputes, [d.paypalDisputeId]: d } })),
  pushFeed: (item) =>
    set((s) => (s.feed.some((f) => f.key === item.key) ? s : { feed: [item, ...s.feed].slice(0, FEED_MAX) })),
  applyStream: (b) =>
    set((s) => {
      const next: Partial<AppState> = {};
      // Same rule as upsertOrder, applied in delivery order: rowVersion only grows, so a replayed older row never wins.
      let orders: Record<string, OrderRow> | undefined;
      for (const row of b.orders) {
        const cur = (orders ?? s.orders)[row.id];
        if (cur && cur.rowVersion > row.rowVersion) continue;
        orders ??= { ...s.orders };
        orders[row.id] = row;
      }
      if (orders) next.orders = orders;
      if (b.disputes.length) {
        const disputes = { ...s.disputes };
        for (const d of b.disputes) disputes[d.paypalDisputeId] = d;
        next.disputes = disputes;
      }
      if (b.feed.length) {
        const seen = new Set(s.feed.map((f) => f.key));
        const fresh: FeedItem[] = [];
        for (const item of b.feed) if (!seen.has(item.key)) { seen.add(item.key); fresh.unshift(item); }
        if (fresh.length) next.feed = [...fresh, ...s.feed].slice(0, FEED_MAX);
      }
      return Object.keys(next).length ? next : s;
    }),
  setSelfcheck: (selfcheck) => set({ selfcheck }),
  setStream: (stream) => set({ stream }),
  setOffsetDays: (offsetDays) => set({ offsetDays }),
  setDrawer: (drawerOpen) => {
    // The drawer is a place worth linking to: #activity opens it on load, and it keeps the address in step (no history entry, no scroll jump).
    const h = window.location.hash;
    if (drawerOpen && h !== DRAWER_HASH) window.history.replaceState(null, '', DRAWER_HASH);
    else if (!drawerOpen && h === DRAWER_HASH) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    set({ drawerOpen });
  },
  openEvidence: (evidenceFor) => {
    // A dispute's evidence is a resource with an id, so it gets a link: #dispute/<paypal id>. Order dialogs act on money and stay unlinked.
    const h = window.location.hash;
    if (evidenceFor) window.history.replaceState(null, '', `${DISPUTE_HASH}${encodeURIComponent(evidenceFor)}`);
    else if (h.startsWith(DISPUTE_HASH)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    set({ evidenceFor });
  },
  toast: (kind, text) => set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, kind, text }].slice(-4) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// A pasted link or the back button can change the hash after load. It only ever opens a panel: the section anchors (#console) leave open panels alone.
window.addEventListener('hashchange', () => {
  const st = useStore.getState();
  if (window.location.hash === DRAWER_HASH && !st.drawerOpen) useStore.setState({ drawerOpen: true });
  const id = disputeFromHash();
  if (id && id !== st.evidenceFor) useStore.setState({ evidenceFor: id });
});
