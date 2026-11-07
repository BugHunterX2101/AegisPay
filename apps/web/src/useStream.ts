import { useEffect } from 'react';
import { api } from './api.ts';
import { useStore } from './store.ts';
import type { Dispute, FeedItem, OrderRow, SelfCheck } from './types.ts';

const FEED_EVENTS = ['agent.step', 'gate.decision', 'webhook.verified', 'mandate.draft'] as const;

/** Load (or reload) the grid's source data. Used on first paint and whenever the stream says it fell too far behind. */
export async function loadAll(): Promise<void> {
  const [o, d] = await Promise.all([
    api<{ orders: OrderRow[] }>('GET', '/api/orders'),
    api<{ disputes: Dispute[] }>('GET', '/api/disputes'),
  ]);
  const s = useStore.getState();
  s.setOrders(o.orders);
  s.setDisputes(d.disputes);
}

/**
 * One EventSource for the whole page. The server tags each message with the audit sequence number, so after a dropped
 * connection the browser reconnects with Last-Event-ID and the server replays what was missed; `resync` means it could
 * not, and the grid is reloaded in full.
 */
export function useStream(): void {
  useEffect(() => {
    const es = new EventSource('/api/stream');
    const st = useStore.getState();
    es.onopen = () => st.setStream('live');
    es.onerror = () => st.setStream(es.readyState === EventSource.CLOSED ? 'connecting' : 'reconnecting');

    const parse = <T,>(e: Event): T => JSON.parse((e as MessageEvent).data as string) as T;
    es.addEventListener('order.upsert', (e) => useStore.getState().upsertOrder(parse<OrderRow>(e)));
    es.addEventListener('dispute.upsert', (e) => useStore.getState().upsertDispute(parse<Dispute>(e)));
    es.addEventListener('selfcheck.result', (e) => useStore.getState().setSelfcheck(parse<SelfCheck>(e)));
    es.addEventListener('resync', () => void loadAll());
    for (const kind of FEED_EVENTS) {
      es.addEventListener(kind, (e) => {
        const data = parse<Record<string, unknown>>(e);
        const at = typeof data.at === 'string' ? data.at : new Date().toISOString();
        const item: FeedItem = { key: `${kind}:${(e as MessageEvent).lastEventId || at}`, kind, at, data };
        useStore.getState().pushFeed(item);
      });
    }
    return () => es.close();
  }, []);
}
