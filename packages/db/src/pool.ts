import pg from 'pg';
import { DomainError } from '@aegis/core';

export type Db = pg.Pool;
/** A transaction handle: every query through it is inside the same BEGIN/COMMIT. */
export type Tx = pg.PoolClient;
export type Queryable = Pick<pg.Pool, 'query'>;

/**
 * Type parsers that make money and dates safe:
 *  - int8 → bigint (money, seq, counts) so nothing silently loses precision past 2^53
 *  - date → 'YYYY-MM-DD' string (the default parser builds a local-midnight Date and shifts the day)
 */
const types = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === 20) return (v: string) => BigInt(v);
    if (oid === 1082) return (v: string) => v;
    return pg.types.getTypeParser(oid, format as 'text');
  },
};

export interface PoolOptions {
  connectionString?: string;
  max?: number;
  /** Used by integration tests to isolate each file in its own schema. */
  searchPath?: string;
  applicationName?: string;
}

export function createPool(opts: PoolOptions = {}): Db {
  const connectionString = opts.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 10,
    application_name: opts.applicationName ?? 'aegispay',
    types,
    ...(opts.searchPath ? { options: `-c search_path=${opts.searchPath}` } : {}),
  });
  // An idle client erroring (e.g. the DB restarted) must not crash the process.
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  return pool;
}

let shared: Db | undefined;
export function getPool(): Db {
  shared ??= createPool();
  return shared;
}
export async function closePool(): Promise<void> {
  const p = shared;
  shared = undefined;
  await p?.end();
}

/**
 * Serialise `fn` across every process sharing this database, keyed by a string, WITHOUT holding a transaction open.
 *
 * Used where a read-decide-call-record sequence spans a network call (refunds): a transaction must not span that call,
 * but two concurrent runs must not both decide on the same stale facts. A session-level advisory lock does this:
 *  - it lives on one dedicated connection and is released on unlock, or by Postgres if the process dies;
 *  - waiters poll `pg_try_advisory_lock` and give their connection back between tries, so a burst of waiters can
 *    never exhaust the pool and starve the holder, which needs pool connections for its own queries;
 *  - `fn` must use the pool (not the lock connection) for its queries.
 * Throws DomainError('CONCURRENT_UPDATE') if the lock is not obtained within `waitMs`.
 */
export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>, db: Db = getPool(), waitMs = 45_000): Promise<T> {
  const deadline = Date.now() + waitMs;
  let client: Tx | undefined;
  for (;;) {
    const c = await db.connect();
    let got = false;
    try {
      const r = await c.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtextextended($1, 0)) as ok', [key]);
      got = r.rows[0]!.ok;
    } catch (err) {
      c.release(err as Error);
      throw err;
    }
    if (got) {
      client = c;
      break;
    }
    c.release();
    if (Date.now() >= deadline) throw new DomainError('CONCURRENT_UPDATE', `another operation holds '${key}' and did not finish within ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 50)));
  }
  let broken: Error | undefined;
  try {
    return await fn();
  } finally {
    try {
      await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [key]);
    } catch (err) {
      broken = err as Error; // connection unusable: destroying it makes Postgres drop the session lock
    }
    client.release(broken);
  }
}

/** Run `fn` in one transaction. Rolls back on any throw; the caller's error is what surfaces. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, db: Db = getPool()): Promise<T> {
  const client = await db.connect();
  let broken: Error | undefined;
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch (rollbackErr) {
      broken = rollbackErr as Error; // connection is unusable: destroy it instead of pooling it
    }
    throw err;
  } finally {
    client.release(broken);
  }
}
