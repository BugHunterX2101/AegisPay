import pg from 'pg';

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
