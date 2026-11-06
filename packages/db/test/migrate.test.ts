import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, createPool, migrate } from '../src/index.ts';
import { TEST_URL, freshDb } from './helpers.ts';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

async function emptySchemaPool() {
  const admin = new pg.Pool({ connectionString: TEST_URL, max: 1 });
  const schema = `m_${Math.random().toString(16).slice(2, 10)}`;
  await admin.query(`create schema ${schema}`);
  const db = createPool({ connectionString: TEST_URL, searchPath: schema, max: 4 });
  cleanup.push(async () => {
    await db.end();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  });
  return db;
}

async function tempMigrations() {
  const dir = await mkdtemp(join(tmpdir(), 'aegis-mig-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  await cp(MIGRATIONS_DIR, dir, { recursive: true });
  return `${dir}/`;
}

describe('migrate', () => {
  it('applies all five migrations once, then reports them as up to date', async () => {
    const db = await emptySchemaPool();
    const first = await migrate(db);
    expect(first.applied).toEqual([
      '0001_init.sql', '0002_audit_guard.sql', '0003_indexes.sql', '0004_supplier_profile.sql', '0005_refund.sql',
    ]);
    const second = await migrate(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toHaveLength(5);
  });

  it('creates every table in the spec and seeds the default supplier profile', async () => {
    const t = await freshDb();
    cleanup.push(() => t.drop());
    const { rows } = await t.db.query(
      `select table_name from information_schema.tables where table_schema = $1 order by 1`,
      [t.schema],
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      ['audit_event', 'catalog_snapshot', 'dispute', 'evidence_bundle', 'fulfillment', 'mandate',
        'proposal', 'purchase_order', 'refund', 'schema_migration', 'supplier_profile', 'webhook_event'],
    );
    const sp = await t.db.query('select * from supplier_profile');
    expect(sp.rows).toEqual([{ domain: '*', lead_time_min_days: 3, lead_time_max_days: 7, reliability: '0.90' }]);
  });

  it('refuses to run when an applied migration file was edited afterwards', async () => {
    const db = await emptySchemaPool();
    const dir = await tempMigrations();
    await migrate(db, dir);
    const f = `${dir}0003_indexes.sql`;
    await writeFile(f, `${await readFile(f, 'utf8')}\n-- sneaky edit\n`);
    await expect(migrate(db, dir)).rejects.toThrow(/0003_indexes\.sql was modified/);
  });

  it('rolls a failing migration back completely and does not record it', async () => {
    const db = await emptySchemaPool();
    const dir = await tempMigrations();
    await writeFile(`${dir}0006_bad.sql`, 'create table half_done (id int); select 1/0;');
    await expect(migrate(db, dir)).rejects.toThrow(/0006_bad\.sql failed/);
    const tbl = await db.query(`select to_regclass('half_done') as t`);
    expect(tbl.rows[0].t).toBeNull();
    const rec = await db.query(`select name from schema_migration where name = '0006_bad.sql'`);
    expect(rec.rowCount).toBe(0);
    // earlier migrations stay applied and a fixed file then succeeds
    await writeFile(`${dir}0006_bad.sql`, 'create table half_done (id int);');
    expect((await migrate(db, dir)).applied).toEqual(['0006_bad.sql']);
  });

  it('concurrent migrators serialise on the advisory lock and apply each file exactly once', async () => {
    const db = await emptySchemaPool();
    const results = await Promise.all([migrate(db), migrate(db), migrate(db)]);
    const appliedCounts = results.map((r) => r.applied.length).sort();
    expect(appliedCounts).toEqual([0, 0, 5]);
  });
});
