import { useEffect } from 'react';
import { api, getSession } from './api.ts';
import { useStore } from './store.ts';
import type { StreamBatch } from './store.ts';
import type { Dispute, OrderRow, SelfCheck } from './types.ts';

const FEED_EVENTS = ['agent.step', 'gate.decision', 'webhook.verified', 'mandate.draft'] as const;
const MAX_RETRY_MS = 30_000;

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

const parse = <T,>(e: Event): T => JSON.parse((e as MessageEvent).data as string) as T;

/** A reload the stream triggers on its own has no button to report a failure on; the next event or retry repairs it. */
const reload = () => void loadAll().catch(() => undefined);

/**
 * Stream messages are queued and applied once per animation frame. Each SSE message is its own task, so React cannot
 * batch them: a reconnect replay or an agent run of 60 events used to mean 60 store updates, 60 grid recomputes and 60
 * syncs of the 3D scene and the relief, back to back. Now it is one of each per frame, and a frame never shows a
 * half-applied burst. Order is kept: the store applies the batch in delivery order with the usual rowVersion rule.
 * A hidden tab gets no animation frames, so there the queue is flushed on a timer instead of growing.
 */
const pending: StreamBatch = { orders: [], disputes: [], feed: [] };
let scheduled = false;
const HIDDEN_FLUSH_MS = 250;

function flush(): void {
  scheduled = false;
  if (!pending.orders.length && !pending.disputes.length && !pending.feed.length) return;
  const batch: StreamBatch = { orders: pending.orders.splice(0), disputes: pending.disputes.splice(0), feed: pending.feed.splice(0) };
  useStore.getState().applyStream(batch);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  if (document.visibilityState === 'visible') requestAnimationFrame(flush);
  else setTimeout(flush, HIDDEN_FLUSH_MS);
}

function wire(es: EventSource): void {
  es.addEventListener('order.upsert', (e) => { pending.orders.push(parse<OrderRow>(e)); schedule(); });
  es.addEventListener('dispute.upsert', (e) => { pending.disputes.push(parse<Dispute>(e)); schedule(); });
  es.addEventListener('selfcheck.result', (e) => useStore.getState().setSelfcheck(parse<SelfCheck>(e)));
  // A resync replaces the grid wholesale: drop queued rows first so an older queued upsert cannot land after the reload.
  es.addEventListener('resync', () => { pending.orders.length = 0; pending.disputes.length = 0; reload(); });
  for (const kind of FEED_EVENTS) {
    es.addEventListener(kind, (e) => {
      const data = parse<Record<string, unknown>>(e);
      const at = typeof data.at === 'string' ? data.at : new Date().toISOString();
      pending.feed.push({ key: `${kind}:${(e as MessageEvent).lastEventId || at}`, kind, at, data });
      schedule();
    });
  }
}

/**
 * One EventSource for the whole page. The server tags each message with the audit sequence number, so after a dropped
 * connection the browser reconnects with Last-Event-ID and the server replays what was missed; `resync` means it could
 * not, and the grid is reloaded in full.
 *
 * The browser only retries on its own while the connection is merely dropped. If the server answers with an error
 * status (a 401 after a server restart invalidated the cookie, a 502 while a deploy swaps instances), the EventSource
 * is CLOSED for good. Then the session is refreshed and a new EventSource is opened after a growing delay (1 s, 2 s,
 * 4 s … capped at 30 s). A new EventSource starts without Last-Event-ID, so the grid is reloaded once it is open again.
 */
export function useStream(): void {
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let failures = 0;

    const open = (afterClose: boolean) => {
      if (stopped) return;
      const src = new EventSource('/api/stream');
      es = src;
      src.onopen = () => {
        failures = 0;
        useStore.getState().setStream('live');
        if (afterClose) reload();
      };
      src.onerror = () => {
        if (src.readyState !== EventSource.CLOSED) {
          useStore.getState().setStream('reconnecting');
          return;
        }
        src.close();
        useStore.getState().setStream('connecting');
        const delay = Math.min(MAX_RETRY_MS, 1_000 * 2 ** failures);
        failures += 1;
        timer = setTimeout(() => {
          // Still down: the session call fails, the next EventSource fails too, and that schedules the next try.
          void getSession(true)
            .catch(() => undefined)
            .then(() => open(true));
        }, delay);
      };
      wire(src);
    };

    open(false);
    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, []);
}
