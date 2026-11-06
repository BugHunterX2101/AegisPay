import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError, ORDER_STATES } from '@aegis/core';
import { getOrder, insertOrder, transition, uuidv7, withTx } from '../src/index.ts';
import type { OrderState } from '@aegis/core';
import { freshDb, seedProposal } from './helpers.ts';
import type { TestDb } from './helpers.ts';

let t: TestDb;
beforeAll(async () => {
  t = await freshDb();
});
afterAll(async () => {
  await t.drop();
});

async function newOrder(state: OrderState, amountMinor = 171000n) {
  const proposalId = await seedProposal(t.db);
  return withTx((tx) => insertOrder(tx, { id: uuidv7(), proposalId, state, amountMinor }), t.db);
}
const stateOf = async (id: string) => (await withTx((tx) => getOrder(tx, id), t.db))!.state;

describe('purchase_order storage', () => {
  it('round-trips money as bigint beyond 2^53 and dates as plain strings', async () => {
    const o = await newOrder('GATED', 9_007_199_254_740_993n);
    expect(o.amountMinor).toBe(9_007_199_254_740_993n);
    expect(o.currency).toBe('USD');
    const { rows } = await t.db.query('select deliver_by from mandate limit 1');
    expect(rows[0].deliver_by).toBe('2026-11-25');
  });

  it('accepts every state in the core state machine and rejects an unknown one', async () => {
    for (const s of ORDER_STATES) await newOrder(s);
    await expect(newOrder('BOGUS' as OrderState)).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects negative amounts and non-USD currency at the database', async () => {
    const proposalId = await seedProposal(t.db);
    await expect(
      t.db.query(`insert into purchase_order (id, proposal_id, state, amount_minor, currency) values ($1,$2,'GATED',-1,'USD')`, [uuidv7(), proposalId]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      t.db.query(`insert into purchase_order (id, proposal_id, state, amount_minor, currency) values ($1,$2,'GATED',1,'EUR')`, [uuidv7(), proposalId]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces one order per proposal and unique PayPal order / capture ids', async () => {
    const o = await newOrder('GATED');
    await expect(
      t.db.query(`insert into purchase_order (id, proposal_id, state, amount_minor, currency) values ($1,$2,'GATED',1,'USD')`, [uuidv7(), o.proposalId]),
    ).rejects.toMatchObject({ code: '23505' });
    const a = await newOrder('AWAITING_APPROVAL');
    const b = await newOrder('AWAITING_APPROVAL');
    await withTx((tx) => transition(tx, a.id, ['AWAITING_APPROVAL'], 'HELD', { paypalOrderId: 'PP-1' }), t.db);
    await expect(
      withTx((tx) => transition(tx, b.id, ['AWAITING_APPROVAL'], 'HELD', { paypalOrderId: 'PP-1' }), t.db),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('transition()', () => {
  it('APPLIED: moves the state, bumps row_version, stamps the patch', async () => {
    const o = await newOrder('AWAITING_APPROVAL');
    const when = new Date('2026-11-05T12:00:00Z');
    const r = await withTx(
      (tx) =>
        transition(tx, o.id, ['AWAITING_APPROVAL'], 'HELD', {
          paypalOrderId: 'PP-A', authorizationId: 'AUTH-1', approvedBy: 'owner', approvedAt: when,
          authCreatedAt: when, payerId: 'PAYER-1',
        }),
      t.db,
    );
    expect(r).toBe('APPLIED');
    const after = (await withTx((tx) => getOrder(tx, o.id), t.db))!;
    expect(after).toMatchObject({
      state: 'HELD', paypalOrderId: 'PP-A', authorizationId: 'AUTH-1', approvedBy: 'owner', payerId: 'PAYER-1',
      rowVersion: o.rowVersion + 1,
    });
    expect(after.approvedAt?.toISOString()).toBe(when.toISOString());
  });

  it('ALREADY_THERE: a duplicate or late event is a no-op that does not bump row_version', async () => {
    const o = await newOrder('IN_TRANSIT');
    const r = await withTx((tx) => transition(tx, o.id, ['HELD'], 'IN_TRANSIT'), t.db);
    expect(r).toBe('ALREADY_THERE');
    expect((await withTx((tx) => getOrder(tx, o.id), t.db))!.rowVersion).toBe(o.rowVersion);
  });

  it('CONFLICT: the order is in a different state than expected', async () => {
    const o = await newOrder('VOIDED');
    expect(await withTx((tx) => transition(tx, o.id, ['HELD'], 'IN_TRANSIT'), t.db)).toBe('CONFLICT');
    expect(await stateOf(o.id)).toBe('VOIDED');
  });

  it('CONFLICT: a stale expectedVersion loses even when the state matches', async () => {
    const o = await newOrder('HELD');
    const bad = await withTx((tx) => transition(tx, o.id, ['HELD'], 'IN_TRANSIT', {}, { expectedVersion: o.rowVersion + 5 }), t.db);
    expect(bad).toBe('CONFLICT');
    const good = await withTx((tx) => transition(tx, o.id, ['HELD'], 'IN_TRANSIT', {}, { expectedVersion: o.rowVersion }), t.db);
    expect(good).toBe('APPLIED');
  });

  it('throws BAD_STATE for a pair the state machine forbids, and NOT_FOUND for a missing order', async () => {
    const o = await newOrder('HELD');
    await expect(withTx((tx) => transition(tx, o.id, ['HELD'], 'SETTLED'), t.db)).rejects.toMatchObject({ code: 'BAD_STATE' });
    await expect(withTx((tx) => transition(tx, o.id, ['HELD'], 'SETTLED'), t.db)).rejects.toBeInstanceOf(DomainError);
    await expect(withTx((tx) => transition(tx, uuidv7(), ['HELD'], 'IN_TRANSIT'), t.db)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await stateOf(o.id)).toBe('HELD');
  });

  it('supports the HELD → HELD reauthorize loop and keeps every superseded authorization id', async () => {
    const o = await newOrder('HELD');
    await withTx((tx) => transition(tx, o.id, ['HELD'], 'HELD', { authorizationId: 'AUTH-2', appendAuthorizationId: 'AUTH-1' }), t.db);
    await withTx((tx) => transition(tx, o.id, ['HELD'], 'HELD', { authorizationId: 'AUTH-3', appendAuthorizationId: 'AUTH-2' }), t.db);
    const after = (await withTx((tx) => getOrder(tx, o.id), t.db))!;
    expect(after.authorizationHistory).toEqual(['AUTH-1', 'AUTH-2']);
    expect(after.authorizationId).toBe('AUTH-3');
    expect(after.rowVersion).toBe(o.rowVersion + 2);
  });

  it('rolls the transition back together with the rest of the transaction', async () => {
    const o = await newOrder('HELD');
    await expect(
      withTx(async (tx) => {
        await transition(tx, o.id, ['HELD'], 'VOIDED');
        throw new Error('later step failed');
      }, t.db),
    ).rejects.toThrow('later step failed');
    expect(await stateOf(o.id)).toBe('HELD');
  });

  it('race: a webhook and a user click on the same order can never both apply (50 trials)', async () => {
    for (let i = 0; i < 50; i++) {
      const o = await newOrder('HELD');
      const [x, y] = await Promise.all([
        withTx((tx) => transition(tx, o.id, ['HELD'], 'IN_TRANSIT'), t.db),
        withTx((tx) => transition(tx, o.id, ['HELD'], 'VOIDED'), t.db),
      ]);
      expect([x, y].filter((r) => r === 'APPLIED')).toHaveLength(1);
      expect([x, y].filter((r) => r === 'CONFLICT')).toHaveLength(1);
      const final = await stateOf(o.id);
      expect(final).toBe(x === 'APPLIED' ? 'IN_TRANSIT' : 'VOIDED');
      expect((await withTx((tx) => getOrder(tx, o.id), t.db))!.rowVersion).toBe(o.rowVersion + 1);
    }
  }, 60_000);

  it('race: two identical webhook deliveries apply once and the other is ALREADY_THERE', async () => {
    const o = await newOrder('IN_TRANSIT');
    const results = await Promise.all(
      Array.from({ length: 8 }, () => withTx((tx) => transition(tx, o.id, ['IN_TRANSIT'], 'DELIVERED'), t.db)),
    );
    expect(results.filter((r) => r === 'APPLIED')).toHaveLength(1);
    expect(results.filter((r) => r === 'ALREADY_THERE')).toHaveLength(7);
  });
});
