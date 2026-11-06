import { AUDIT_NOTIFY_CHANNEL, auditHeadSeq, getDispute, getOrderGridRow, listAuditAfter } from '@aegis/db';
import type { AuditRow, Db, Tx } from '@aegis/db';
import type { SseEventName } from '@aegis/core';
import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { toJson } from './json.ts';

export interface SseMessage {
  /** audit_event.seq of the newest audit row this message reflects: what a reconnecting client sends as Last-Event-ID. */
  id: bigint;
  event: SseEventName;
  data: unknown;
}

type Log = (level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) => void;

/**
 * Audit rows -> stream messages. The audit log is the source of truth and the stream is only ever told about committed
 * rows (appendAudit notifies inside its own transaction). A message carries the entity's CURRENT state, read fresh, not
 * the audit payload: several rows for one order in a batch collapse into one `order.upsert` with the latest row, which
 * is what a grid applying transactions wants.
 */
export async function toMessages(db: Db, rows: readonly AuditRow[]): Promise<SseMessage[]> {
  const latest = new Map<string, { kind: 'order' | 'dispute'; id: string; seq: bigint }>();
  for (const r of rows) {
    if (!r.entityId) continue;
    const kind = r.entity === 'purchase_order' ? 'order' : r.entity === 'dispute' ? 'dispute' : null;
    if (kind) latest.set(`${kind}:${r.entityId}`, { kind, id: r.entityId, seq: r.seq });
  }
  const out: SseMessage[] = [];
  for (const l of latest.values()) {
    if (l.kind === 'order') {
      const row = await getOrderGridRow(db, l.id);
      if (row) out.push({ id: l.seq, event: 'order.upsert', data: row });
    } else {
      const d = await getDispute(db, l.id);
      if (d) out.push({ id: l.seq, event: 'dispute.upsert', data: d });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * One LISTEN connection per process fans out to every open stream, so a hundred browser tabs cost one database
 * connection. If the connection drops it is re-opened and the gap is closed from the audit log, so no event is lost
 * across a reconnect, only delayed.
 */
export class StreamHub {
  private readonly subs = new Set<(m: SseMessage) => void>();
  private client: Tx | null = null;
  private lastSeq = 0n;
  private running = false;
  private pumping: Promise<void> = Promise.resolve();
  private retry: NodeJS.Timeout | null = null;

  constructor(private readonly db: Db, private readonly log: Log) {}

  async start(): Promise<void> {
    this.running = true;
    this.lastSeq = await auditHeadSeq(this.db);
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    try {
      const c = await this.db.connect();
      c.on('notification', () => void this.pump());
      const lost = (err?: Error) => {
        if (this.client !== c) return;
        this.client = null;
        c.removeAllListeners();
        try {
          c.release(err ?? true);
        } catch {
          /* already released */
        }
        this.log('warn', 'stream.listen.lost', { message: err?.message ?? 'connection ended' });
        this.scheduleReconnect();
      };
      c.on('error', lost);
      c.on('end', () => lost());
      await c.query(`LISTEN ${AUDIT_NOTIFY_CHANNEL}`);
      this.client = c;
      await this.pump(); // anything committed while we were not listening
    } catch (err) {
      this.log('warn', 'stream.listen.failed', { message: err instanceof Error ? err.message : String(err) });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, 1000);
    this.retry.unref();
  }

  /** Serialised: notifications arrive in bursts, and two pumps reading the same range would send everything twice. */
  private pump(): Promise<void> {
    this.pumping = this.pumping.then(async () => {
      try {
        for (;;) {
          const rows = await listAuditAfter(this.db, this.lastSeq, 200);
          if (rows.length === 0) return;
          this.lastSeq = rows[rows.length - 1]!.seq;
          for (const m of await toMessages(this.db, rows)) for (const s of this.subs) s(m);
          if (rows.length < 200) return;
        }
      } catch (err) {
        this.log('error', 'stream.pump.failed', { message: err instanceof Error ? err.message : String(err) });
      }
    });
    return this.pumping;
  }

  subscribe(fn: (m: SseMessage) => void): () => void {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  /** What a client missed: rows after `afterSeq`, capped. Past the cap the client is told to reload the grid. */
  async replay(afterSeq: bigint, cap = 500): Promise<{ messages: SseMessage[]; truncated: boolean }> {
    const rows = await listAuditAfter(this.db, afterSeq, cap + 1);
    const truncated = rows.length > cap;
    return { messages: await toMessages(this.db, truncated ? rows.slice(0, cap) : rows), truncated };
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.retry) clearTimeout(this.retry);
    this.subs.clear();
    const c = this.client;
    this.client = null;
    if (c) {
      c.removeAllListeners();
      try {
        await c.query(`UNLISTEN ${AUDIT_NOTIFY_CHANNEL}`);
      } catch {
        /* connection already gone */
      }
      c.release(true); // destroy it: a LISTENing connection must not go back into the pool
    }
  }
}

const frame = (m: SseMessage) => `id: ${m.id}\nevent: ${m.event}\ndata: ${toJson(m.data)}\n\n`;

const parseSeq = (v: unknown): bigint | null => (typeof v === 'string' && /^\d{1,18}$/.test(v) ? BigInt(v) : null);

export interface StreamRouteOptions {
  hub: StreamHub;
  heartbeatMs: number;
}

/** GET /api/stream. One connection per tab; heartbeat comment; resumes from Last-Event-ID. */
export function registerStream(app: FastifyInstance, o: StreamRouteOptions): void {
  const open = new Set<ServerResponse>();

  app.addHook('onClose', async () => {
    for (const res of open) res.end();
    open.clear();
  });

  app.get('/api/stream', { config: { rateLimit: false } }, (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // tell a reverse proxy not to hold the stream back
    });
    res.write('retry: 3000\n\n');
    open.add(res);

    let live = false;
    const pending: SseMessage[] = [];
    let sentUpTo = -1n;
    const send = (m: SseMessage) => {
      if (m.id <= sentUpTo) return;
      sentUpTo = m.id;
      res.write(frame(m));
    };
    const unsubscribe = o.hub.subscribe((m) => (live ? send(m) : pending.push(m)));
    const beat = setInterval(() => res.write(': heartbeat\n\n'), o.heartbeatMs);
    const done = () => {
      clearInterval(beat);
      unsubscribe();
      open.delete(res);
    };
    req.raw.on('close', done);

    void (async () => {
      try {
        const last = parseSeq(req.headers['last-event-id']);
        if (last !== null) {
          const { messages, truncated } = await o.hub.replay(last);
          for (const m of messages) send(m);
          if (truncated) res.write('event: resync\ndata: {}\n\n'); // too far behind: reload the grid
        }
        for (const m of pending) send(m);
        pending.length = 0;
        live = true;
        res.write(': ready\n\n');
      } catch (err) {
        req.log.error({ err }, 'stream replay failed');
        res.end();
      }
    })();
  });
}
