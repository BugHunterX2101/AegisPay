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
  setSelfcheck: (s: SelfCheck) => void;
  setStream: (s: StreamStatus) => void;
  setOffsetDays: (n: number) => void;
  setDrawer: (open: boolean) => void;
  openEvidence: (id: string | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
}

const FEED_MAX = 200;
let toastSeq = 0;

export const useStore = create<AppState>((set) => ({
  session: null,
  orders: {},
  disputes: {},
  feed: [],
  selfcheck: null,
  stream: 'connecting',
  offsetDays: 0,
  drawerOpen: false,
  evidenceFor: null,
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
  setSelfcheck: (selfcheck) => set({ selfcheck }),
  setStream: (stream) => set({ stream }),
  setOffsetDays: (offsetDays) => set({ offsetDays }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  openEvidence: (evidenceFor) => set({ evidenceFor }),
  toast: (kind, text) => set((s) => ({ toasts: [...s.toasts, { id: ++toastSeq, kind, text }].slice(-4) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
