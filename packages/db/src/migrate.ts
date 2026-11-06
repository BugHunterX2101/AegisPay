import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));
/** Session-level advisory lock so two deploys can never run the migrator at once. */
const MIGRATE_LOCK_KEY = 4242;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Plain-SQL migrator. Files run in lexical order, each in its own transaction, recorded in
 * schema_migration with a checksum. An already-applied file whose content changed is an error:
 * history is immutable, add a new migration instead.
 */
export async function migrate(db: Db, dir: string = MIGRATIONS_DIR): Promise<MigrationResult> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const client = await db.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATE_LOCK_KEY]);
    await client.query(
      `create table if not exists schema_migration (
         name text primary key, sha256 char(64) not null, applied_at timestamptz not null default now())`,
    );
    const done = new Map(
      (await client.query<{ name: string; sha256: string }>('select name, sha256 from schema_migration')).rows.map(
        (r) => [r.name, r.sha256] as const,
      ),
    );
    for (const name of files) {
      const sql = await readFile(`${dir}${name}`, 'utf8');
      const digest = sha(sql);
      const prior = done.get(name);
      if (prior !== undefined) {
        if (prior !== digest) throw new Error(`Migration ${name} was modified after it was applied`);
        result.skipped.push(name);
        continue;
      }
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migration (name, sha256) values ($1, $2)', [name, digest]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`, { cause: err });
      }
      result.applied.push(name);
    }
    return result;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
