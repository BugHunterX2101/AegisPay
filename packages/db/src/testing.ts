import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { uuidv7 } from './ids.ts';
import { migrate } from './migrate.ts';
import { createPool } from './pool.ts';
import type { Db } from './pool.ts';

/** Real Postgres 16 (docker run … -p 54329:5432). No mocks: these tests exercise the actual database. */
export const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://aegis:aegis@localhost:54329/aegis_test';

export interface TestDb {
  db: Db;
  schema: string;
  drop(): Promise<void>;
}

/** Each test file/case gets its own schema, migrated from the real migration files, then dropped. */
export async function freshDb(): Promise<TestDb> {
  const admin = new pg.Pool({ connectionString: TEST_URL, max: 1 });
  try {
    await admin.query('select 1');
  } catch (err) {
    await admin.end();
    throw new Error(
      `Test Postgres unreachable at ${TEST_URL} (${(err as Error).message}). ` +
        'Start it: docker run -d --name aegispay-pg -e POSTGRES_USER=aegis -e POSTGRES_PASSWORD=aegis ' +
        '-e POSTGRES_DB=aegis_test -p 54329:5432 postgres:16-alpine',
    );
  }
  const schema = `t_${randomBytes(6).toString('hex')}`;
  await admin.query(`create schema ${schema}`);
  const db = createPool({ connectionString: TEST_URL, searchPath: schema, max: 12, applicationName: 'aegis-test' });
  await migrate(db);
  return {
    db,
    schema,
    async drop() {
      await db.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}

/** Insert the mandate → proposal parents a purchase_order needs; returns the proposal id. */
export async function seedProposal(db: Db): Promise<string> {
  const mandateId = uuidv7();
  const proposalId = uuidv7();
  await db.query(
    `insert into mandate (id, version, status, spec, quantity, unit_ceiling_minor, budget_minor, currency,
       deliver_by, approval_threshold_minor, expires_at, sha256, created_by)
     values ($1, 1, 'ACTIVE', '{"keywords":["cable"]}', 10, 18000, 200000, 'USD',
       '2026-11-25', 100000, '2026-12-31T00:00:00Z', $2, 'test')`,
    [mandateId, 'a'.repeat(64)],
  );
  await db.query(`insert into proposal (id, mandate_id, mandate_version) values ($1, $2, 1)`, [proposalId, mandateId]);
  return proposalId;
}
