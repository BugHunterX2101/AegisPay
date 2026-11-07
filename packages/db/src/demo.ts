import type { OffsetClock } from '@aegis/core';
import { appendAudit } from './audit.ts';
import { withTx } from './pool.ts';
import type { Db, Queryable } from './pool.ts';

const CLOCK_KEY = 'clock_offset_ms';

/** The demo clock offset the operator set (Judge Mode). 0 when never set. */
export async function getClockOffsetMs(db: Queryable): Promise<number> {
  const r = await db.query<{ value: string }>('select value from demo_setting where key = $1', [CLOCK_KEY]);
  const n = Number(r.rows[0]?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function setClockOffsetMs(db: Queryable, ms: number): Promise<void> {
  if (!Number.isFinite(ms)) throw new RangeError('clock offset must be finite');
  await db.query(
    `insert into demo_setting (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [CLOCK_KEY, String(Math.trunc(ms))],
  );
}

/**
 * Keep an in-process OffsetClock equal to the stored offset. The API and the worker are separate processes, so the
 * database is where they agree on "now" for SLA timers. Polls; a failed poll keeps the last known offset.
 */
export async function watchClockOffset(db: Queryable, clock: OffsetClock, o: { intervalMs?: number; onError?: (e: unknown) => void } = {}): Promise<{ stop(): void }> {
  const sync = async () => {
    try {
      clock.setOffset(await getClockOffsetMs(db));
    } catch (e) {
      o.onError?.(e);
    }
  };
  await sync();
  const timer = setInterval(() => void sync(), o.intervalMs ?? 2_000);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

/** Tables a demo reset empties, children first. `audit_event`, `webhook_event` and `supplier_profile` are never touched. */
const DEMO_TABLES = ['evidence_bundle', 'dispute', 'refund', 'fulfillment', 'purchase_order', 'proposal', 'catalog_snapshot', 'mandate'] as const;

/**
 * Judge Mode reset: empty the demo tables, put the clock back to real time, and append a DEMO_RESET marker to the audit
 * chain. The chain itself is append-only and is never truncated, so a reset is visible in it, not erased from it.
 */
export async function resetDemo(db: Db, actor: string): Promise<Record<string, number>> {
  return withTx(async (tx) => {
    const deleted: Record<string, number> = {};
    for (const t of DEMO_TABLES) deleted[t] = (await tx.query(`delete from ${t}`)).rowCount ?? 0;
    await setClockOffsetMs(tx, 0);
    await appendAudit(tx, { actor, type: 'DEMO_RESET', entity: 'system', entityId: 'demo', payload: { deleted } });
    return deleted;
  }, db);
}
