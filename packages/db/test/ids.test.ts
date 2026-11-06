import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '../src/index.ts';
import { freshDb } from './helpers.ts';
import type { TestDb } from './helpers.ts';

describe('uuidv7', () => {
  it('has RFC 9562 layout: version 7, variant 10xx, lowercase hex', () => {
    for (let i = 0; i < 500; i++) {
      const id = uuidv7();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('encodes the millisecond timestamp in the first 48 bits', () => {
    const ms = Date.UTC(2026, 10, 5, 12, 0, 0);
    const id = uuidv7(ms);
    const decoded = Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);
    expect(decoded).toBe(ms);
  });

  it('sorts by creation time when generated in later milliseconds', () => {
    const ids = Array.from({ length: 200 }, (_, i) => uuidv7(1_800_000_000_000 + i));
    expect([...ids].sort()).toEqual(ids);
  });

  it('is unique across a large batch within one millisecond', () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => uuidv7(1_800_000_000_000)));
    expect(ids.size).toBe(20_000);
  });

  describe('against Postgres', () => {
    let t: TestDb;
    beforeAll(async () => {
      t = await freshDb();
    });
    afterAll(async () => {
      await t.drop();
    });
    it('is accepted by the uuid column type and reports version 7', async () => {
      const id = uuidv7();
      // uuid_extract_version() is Postgres 17+; read the version nibble from the canonical text instead.
      const { rows } = await t.db.query(`select $1::uuid as id, substr($1::uuid::text, 15, 1) as v`, [id]);
      expect(rows[0].id).toBe(id);
      expect(rows[0].v).toBe('7');
    });
  });
});
