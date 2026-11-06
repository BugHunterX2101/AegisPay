import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZERO_HASH, sha256Hex } from '@aegis/core';
import { appendAudit, verifyChain, withTx } from '../src/index.ts';
import { TEST_URL, freshDb } from './helpers.ts';
import type { TestDb } from './helpers.ts';

let t: TestDb;
beforeEach(async () => {
  t = await freshDb();
});
afterEach(async () => {
  await t.drop();
});

const add = (type: string, payload: unknown = {}, extra: Record<string, string> = {}) =>
  withTx((tx) => appendAudit(tx, { actor: 'test', type, payload, ...extra }), t.db);

/** Run SQL that the append-only trigger would normally block, by disabling it for the duration. */
async function tamper(sql: string, params: unknown[] = []) {
  await withTx(async (tx) => {
    await tx.query('alter table audit_event disable trigger audit_event_no_update_delete');
    await tx.query(sql, params);
    await tx.query('alter table audit_event enable trigger audit_event_no_update_delete');
  }, t.db);
}

describe('audit chain', () => {
  it('an empty chain verifies with the zero head', async () => {
    expect(await verifyChain(t.db)).toEqual({ ok: true, head: ZERO_HASH, count: 0n });
  });

  it('links rows: first prev_hash is 64 zeros, each prev_hash is the previous hash, seq is 1..n', async () => {
    const a = await add('A', { n: 1 });
    const b = await add('B', { n: 2 });
    const c = await add('C', { n: 3 });
    expect([a.seq, b.seq, c.seq]).toEqual([1n, 2n, 3n]);
    const rows = (await t.db.query('select seq, prev_hash, hash from audit_event order by seq')).rows;
    expect(rows[0].prev_hash).toBe(ZERO_HASH);
    expect(rows[1].prev_hash).toBe(a.hash);
    expect(rows[2].prev_hash).toBe(b.hash);
    expect(await verifyChain(t.db)).toEqual({ ok: true, head: c.hash, count: 3n });
  });

  it('stored hash equals an independent recomputation of the documented formula', async () => {
    const { hash } = await add('PAYPAL_CALL', { amount: 17100n, ok: true }, { paypalRequestId: 'req-1' });
    const r = (
      await t.db.query(
        `select seq, to_char(ts at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ts, payload, prev_hash
           from audit_event where seq = 1`,
      )
    ).rows[0];
    const expected = sha256Hex(
      [ZERO_HASH, '1', r.ts, 'test', 'PAYPAL_CALL', '', '', 'req-1', '', '{"amount":"17100","ok":true}'].join('\u001f'),
    );
    expect(hash).toBe(expected);
  });

  it('a rolled-back transaction leaves no audit row and does not advance the chain', async () => {
    await expect(
      withTx(async (tx) => {
        await appendAudit(tx, { actor: 'x', type: 'WILL_ROLL_BACK', payload: {} });
        throw new Error('boom');
      }, t.db),
    ).rejects.toThrow('boom');
    expect((await t.db.query('select count(*)::int as n from audit_event')).rows[0].n).toBe(0);
    expect((await add('FIRST')).seq).toBe(1n);
    expect((await verifyChain(t.db)).ok).toBe(true);
  });

  it('60 concurrent appenders cannot fork the chain: seq is gap-free and the chain verifies', async () => {
    await Promise.all(Array.from({ length: 60 }, (_, i) => add('CONCURRENT', { i })));
    const { rows } = await t.db.query('select seq from audit_event order by seq');
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 60 }, (_, i) => BigInt(i + 1)));
    const v = await verifyChain(t.db);
    expect(v).toMatchObject({ ok: true, count: 60n });
  });

  it('payloads with bigint, nested objects and undefined round-trip through jsonb and still verify', async () => {
    await add('RICH', { big: 9_007_199_254_740_993n, nested: { z: 1, a: [1, undefined, 3] }, gone: undefined, nil: null });
    expect(await verifyChain(t.db)).toMatchObject({ ok: true, count: 1n });
  });

  it('pages correctly across the 1,000-row keyset boundary', async () => {
    for (let i = 0; i < 1025; i += 25) {
      await Promise.all(Array.from({ length: 25 }, (_, j) => add('BULK', { i: i + j })));
    }
    expect(await verifyChain(t.db)).toMatchObject({ ok: true, count: 1025n });
  }, 120_000);
});

describe('append-only enforcement', () => {
  it('blocks UPDATE, DELETE and TRUNCATE at the database level', async () => {
    await add('A');
    await expect(t.db.query(`update audit_event set actor = 'evil'`)).rejects.toMatchObject({ code: '23000' });
    await expect(t.db.query('delete from audit_event')).rejects.toMatchObject({ code: '23000' });
    await expect(t.db.query('truncate audit_event')).rejects.toMatchObject({ code: '23000' });
    expect((await t.db.query('select count(*)::int as n from audit_event')).rows[0].n).toBe(1);
  });
});

describe('tamper detection', () => {
  beforeEach(async () => {
    await add('A', { v: 1 }, { paypalRequestId: 'req-A' });
    await add('B', { v: 2 });
    await add('C', { v: 3 });
  });

  it('detects an edited payload and names the first bad seq', async () => {
    await tamper(`update audit_event set payload = '{"v":999}' where seq = 2`);
    expect(await verifyChain(t.db)).toEqual({ ok: false, firstBadSeq: 2n, reason: 'HASH_MISMATCH' });
  });

  it('detects a value shifted across the actor/type boundary (needs the delimited hash)', async () => {
    await tamper(`update audit_event set actor = 'tes', type = 'tA' where seq = 1`);
    expect(await verifyChain(t.db)).toEqual({ ok: false, firstBadSeq: 1n, reason: 'HASH_MISMATCH' });
  });

  it('detects an edited PayPal request id (covered by the hash)', async () => {
    await tamper(`update audit_event set paypal_request_id = 'forged' where seq = 1`);
    expect(await verifyChain(t.db)).toEqual({ ok: false, firstBadSeq: 1n, reason: 'HASH_MISMATCH' });
  });

  it('detects a deleted middle row as a sequence gap', async () => {
    await tamper('delete from audit_event where seq = 2');
    expect(await verifyChain(t.db)).toEqual({ ok: false, firstBadSeq: 2n, reason: 'SEQ_GAP' });
  });

  it('detects a re-pointed prev_hash', async () => {
    await tamper(`update audit_event set prev_hash = $1 where seq = 3`, ['f'.repeat(64)]);
    expect(await verifyChain(t.db)).toEqual({ ok: false, firstBadSeq: 3n, reason: 'PREV_HASH_MISMATCH' });
  });
});

describe('pg_notify for the SSE feed', () => {
  it('notifies listeners with the seq only after the transaction commits', async () => {
    const listener = new pg.Client({ connectionString: TEST_URL });
    await listener.connect();
    const got: string[] = [];
    listener.on('notification', (m) => got.push(m.payload ?? ''));
    await listener.query('listen aegis');
    try {
      let release!: () => void;
      const hold = new Promise<void>((r) => (release = r));
      const inFlight = withTx(async (tx) => {
        await appendAudit(tx, { actor: 'x', type: 'HELD_OPEN', payload: {} });
        await hold; // uncommitted
      }, t.db);
      await new Promise((r) => setTimeout(r, 300));
      expect(got).toEqual([]); // nothing visible before commit
      release();
      await inFlight;
      await new Promise((r) => setTimeout(r, 300));
      expect(got).toEqual(['1']);
    } finally {
      await listener.end();
    }
  });
});
