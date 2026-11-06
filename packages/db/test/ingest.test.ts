import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '@aegis/core';
import {
  catalogQueryHash, claimVerifiedWebhooks, createMandate, getCatalogSnapshot, getProposalRecord, getSupplierProfile,
  getWebhookEvent, insertCatalogSnapshot, insertProposal, listProposalsForMandate, listSupplierProfiles,
  listUnverifiedWebhooks, markWebhookProcessed, markWebhookVerified, recordWebhookEvent, requireIntactSnapshot,
  snapshotIntact, snapshotSha256, storableHeaders, upsertSupplierProfile, uuidv7, withTx,
} from '../src/index.ts';
import type { NewProposal } from '../src/index.ts';
import { freshDb } from './helpers.ts';
import type { TestDb } from './helpers.ts';

let t: TestDb;
let mandateId: string;
beforeAll(async () => {
  t = await freshDb();
  const m = await withTx(
    (tx) =>
      createMandate(
        tx,
        { spec: { keywords: ['cable'] }, quantity: 10, unitCeiling: '18000', budget: '200000', currency: 'USD', deliverBy: '2026-11-25' },
        { createdBy: 'user:owner', clock: new FixedClock(new Date('2026-11-06T12:00:00Z')) },
      ),
    t.db,
  );
  mandateId = m.id;
});
afterAll(async () => {
  await t.drop();
});

const FETCHED = new Date('2026-11-06T10:00:00Z');

describe('catalog snapshots', () => {
  it('stores the response with a fingerprint that survives the jsonb round trip', async () => {
    const response = { products: [{ id: 'p1', price: { amount: 17.99, currency: 'USD' }, tags: ['a', 'b'] }], total: 1 };
    const s = await withTx((tx) => insertCatalogSnapshot(tx, { response, fetchedAt: FETCHED, query: { keywords: ['cable'] } }), t.db);
    expect(s.sha256).toBe(snapshotSha256(response));
    expect(s.queryHash).toBe(catalogQueryHash({ keywords: ['cable'] }));
    const read = (await getCatalogSnapshot(t.db, s.id))!;
    expect(read.response).toEqual(response);
    expect(read.fetchedAt.toISOString()).toBe(FETCHED.toISOString());
    expect(snapshotIntact(read)).toBe(true);
  });

  it('is independent of key order, and has no query hash when no query was given', async () => {
    expect(snapshotSha256({ a: 1, b: { c: 2, d: 3 } })).toBe(snapshotSha256({ b: { d: 3, c: 2 }, a: 1 }));
    const s = await withTx((tx) => insertCatalogSnapshot(tx, { response: { x: 1 }, fetchedAt: FETCHED }), t.db);
    expect(s.queryHash).toBeNull();
  });

  it('detects a response edited after the fact, and reports a missing snapshot', async () => {
    const s = await withTx((tx) => insertCatalogSnapshot(tx, { response: { price: 1799 }, fetchedAt: FETCHED }), t.db);
    await expect(requireIntactSnapshot(t.db, s.id)).resolves.toMatchObject({ id: s.id });
    await t.db.query(`update catalog_snapshot set response = '{"price": 1}'::jsonb where id = $1`, [s.id]);
    expect(snapshotIntact((await getCatalogSnapshot(t.db, s.id))!)).toBe(false);
    await expect(requireIntactSnapshot(t.db, s.id)).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(requireIntactSnapshot(t.db, uuidv7())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a response that is not JSON-safe and stores nothing', async () => {
    const before = (await t.db.query<{ n: bigint }>('select count(*) n from catalog_snapshot')).rows[0]!.n;
    await expect(withTx((tx) => insertCatalogSnapshot(tx, { response: { price: Number.NaN }, fetchedAt: FETCHED }), t.db)).rejects.toThrow(TypeError);
    expect((await t.db.query<{ n: bigint }>('select count(*) n from catalog_snapshot')).rows[0]!.n).toBe(before);
  });
});

describe('proposals', () => {
  const base = (over: Partial<NewProposal> = {}): NewProposal => ({
    mandateId, mandateVersion: 1, productId: 'p1', domain: 'alpha.com', title: 'USB-C cable 2m', unitPriceMinor: 1799n,
    quantity: 10, shippingMinor: 500n, taxMinor: 0n, eta: '2026-11-20', rating: 4.5, inStock: true, gatePass: true,
    gateResults: [{ id: 'R1', pass: true, label: 'Mandate active', expected: 'x', actual: 'y' }], decisionSha256: 'c'.repeat(64),
    ...over,
  });

  it('round-trips money as bigint, rating as a number, eta as a plain date and the gate results as stored', async () => {
    const snap = await withTx((tx) => insertCatalogSnapshot(tx, { response: { ok: true }, fetchedAt: FETCHED }), t.db);
    const p = await withTx((tx) => insertProposal(tx, base({ snapshotId: snap.id, offerUrl: 'https://alpha.com/p1', rationale: 'cheapest in stock' })), t.db);
    const read = (await getProposalRecord(t.db, p.id))!;
    expect(read).toEqual(p);
    expect(read.unitPriceMinor).toBe(1799n);
    expect(read.rating).toBe(4.5);
    expect(read.eta).toBe('2026-11-20');
    expect(read.snapshotId).toBe(snap.id);
    expect(read.gatePass).toBe(true);
    expect(read.gateResults).toEqual(base().gateResults);
  });

  it('stores a gate decision that contains a bigint (as a decimal string) instead of throwing', async () => {
    const p = await withTx((tx) => insertProposal(tx, base({ gatePass: false, gateResults: { total: 18490n } })), t.db);
    expect((await getProposalRecord(t.db, p.id))!.gateResults).toEqual({ total: '18490' });
  });

  it('rejects a proposal against a mandate version or snapshot that does not exist', async () => {
    await expect(withTx((tx) => insertProposal(tx, base({ mandateVersion: 9 })), t.db)).rejects.toMatchObject({ code: '23503' });
    await expect(withTx((tx) => insertProposal(tx, base({ snapshotId: uuidv7() })), t.db)).rejects.toMatchObject({ code: '23503' });
  });

  it('lists a mandate’s proposals newest first', async () => {
    const a = await withTx((tx) => insertProposal(tx, base({ productId: 'first' })), t.db);
    await new Promise((r) => setTimeout(r, 15));
    const b = await withTx((tx) => insertProposal(tx, base({ productId: 'second' })), t.db);
    const ids = (await listProposalsForMandate(t.db, mandateId)).map((x) => x.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(await listProposalsForMandate(t.db, uuidv7())).toEqual([]);
  });
});

describe('webhook events', () => {
  const evt = (id: string, over: Partial<Parameters<typeof recordWebhookEvent>[1]> = {}) => ({
    eventId: id, eventType: 'PAYMENT.AUTHORIZATION.CREATED', rawBody: Buffer.from('{"id":"' + id + '"}'), headers: { 'paypal-transmission-id': id }, ...over,
  });

  beforeAll(async () => {
    await t.db.query('delete from webhook_event');
  });

  it('keeps the exact bytes received, including ones that are not valid UTF-8, and ignores a redelivery', async () => {
    const raw = Buffer.from([0x7b, 0x20, 0xff, 0xfe, 0x00, 0x0d, 0x0a, 0x7d]);
    expect(await recordWebhookEvent(t.db, evt('WH-BYTES', { rawBody: raw }))).toEqual({ inserted: true });
    expect(await recordWebhookEvent(t.db, evt('WH-BYTES', { rawBody: Buffer.from('different') }))).toEqual({ inserted: false });
    const row = (await getWebhookEvent(t.db, 'WH-BYTES'))!;
    expect(Buffer.compare(row.rawBody, raw)).toBe(0); // the first delivery wins, byte for byte
    expect(row.verified).toBeNull();
    expect(row.processedAt).toBeNull();
    expect(await getWebhookEvent(t.db, 'WH-NOPE')).toBeNull();
  });

  it('stores headers lower-cased and single-valued, and never stores credentials', async () => {
    expect(storableHeaders({
      'PayPal-Auth-Algo': 'SHA256withRSA', Authorization: 'Bearer secret', Cookie: 'sid=1', 'X-Api-Key': 'k',
      'Proxy-Authorization': 'Basic x', 'Set-Cookie': ['a=1'], 'X-Multi': ['one', 'two'], 'X-Absent': undefined,
    })).toEqual({ 'paypal-auth-algo': 'SHA256withRSA', 'x-multi': 'one, two' });
    await recordWebhookEvent(t.db, evt('WH-HDR', { headers: { Authorization: 'Bearer secret', 'Paypal-Cert-Url': 'https://api.sandbox.paypal.com/c' } }));
    expect((await getWebhookEvent(t.db, 'WH-HDR'))!.headers).toEqual({ 'paypal-cert-url': 'https://api.sandbox.paypal.com/c' });
  });

  it('hands out only verified, unprocessed events, oldest first', async () => {
    await t.db.query('delete from webhook_event');
    for (const id of ['WH-A', 'WH-B', 'WH-C', 'WH-D', 'WH-E']) {
      await recordWebhookEvent(t.db, evt(id));
      await new Promise((r) => setTimeout(r, 5));
    }
    await markWebhookVerified(t.db, 'WH-A', 'POSTBACK');
    await markWebhookVerified(t.db, 'WH-B', 'OFFLINE');
    await markWebhookVerified(t.db, 'WH-C', 'FAILED');
    await markWebhookVerified(t.db, 'WH-D', 'POSTBACK');
    await markWebhookProcessed(t.db, 'WH-D');
    // WH-E stays unverified

    const claimed = await withTx((tx) => claimVerifiedWebhooks(tx, 10), t.db);
    expect(claimed.map((e) => e.eventId)).toEqual(['WH-A', 'WH-B']);
    expect((await getWebhookEvent(t.db, 'WH-C'))!.error).toBe('signature verification failed');
  });

  it('two workers pulling at once get different events (skip locked), never the same one', async () => {
    await t.db.query('delete from webhook_event');
    for (const id of ['WH-1', 'WH-2']) {
      await recordWebhookEvent(t.db, evt(id));
      await markWebhookVerified(t.db, id, 'POSTBACK');
      await new Promise((r) => setTimeout(r, 5));
    }
    const [a, b] = await withTx(async (txA) => {
      const first = await claimVerifiedWebhooks(txA, 1);
      const second = await withTx((txB) => claimVerifiedWebhooks(txB, 1), t.db); // txA still holds its lock
      return [first, second] as const;
    }, t.db);
    expect(a.map((e) => e.eventId)).toEqual(['WH-1']);
    expect(b.map((e) => e.eventId)).toEqual(['WH-2']);
  });

  it('processing is idempotent and freezes the verification status', async () => {
    await recordWebhookEvent(t.db, evt('WH-DONE'));
    expect(await markWebhookVerified(t.db, 'WH-DONE', 'OFFLINE')).toBe(true);
    expect(await markWebhookProcessed(t.db, 'WH-DONE')).toBe(true);
    expect(await markWebhookProcessed(t.db, 'WH-DONE', 'late error')).toBe(false);
    expect(await markWebhookVerified(t.db, 'WH-DONE', 'FAILED')).toBe(false);
    const row = (await getWebhookEvent(t.db, 'WH-DONE'))!;
    expect(row.verified).toBe('OFFLINE');
    expect(row.error).toBeNull();
    expect(row.processedAt).toBeInstanceOf(Date);
  });

  it('records the reason when handling fails, and lists stale unverified events for re-verification', async () => {
    await recordWebhookEvent(t.db, evt('WH-ERR'));
    await markWebhookVerified(t.db, 'WH-ERR', 'POSTBACK');
    await markWebhookProcessed(t.db, 'WH-ERR', 'order not found');
    expect((await getWebhookEvent(t.db, 'WH-ERR'))!.error).toBe('order not found');

    await recordWebhookEvent(t.db, evt('WH-STALE'));
    expect((await listUnverifiedWebhooks(t.db, 0)).map((e) => e.eventId)).toContain('WH-STALE');
    expect((await listUnverifiedWebhooks(t.db, 60_000)).map((e) => e.eventId)).not.toContain('WH-STALE');
  });
});

describe('supplier profiles', () => {
  it('falls back to the documented 3–7 day default for an unknown domain and says so', async () => {
    const p = await getSupplierProfile(t.db, 'unknown-shop.example');
    expect(p).toEqual({ domain: '*', leadTimeMinDays: 3, leadTimeMaxDays: 7, reliability: 0.9, isDefault: true });
  });

  it('normalises the domain the same way the gatekeeper does, on write and on read', async () => {
    const saved = await upsertSupplierProfile(t.db, { domain: ' WWW.Acme.COM. ', leadTimeMinDays: 1, leadTimeMaxDays: 2, reliability: 0.75 });
    expect(saved).toEqual({ domain: 'acme.com', leadTimeMinDays: 1, leadTimeMaxDays: 2, reliability: 0.75, isDefault: false });
    expect(await getSupplierProfile(t.db, 'www.ACME.com')).toEqual(saved);
  });

  it('updates in place and keeps the stored reliability when none is given', async () => {
    await upsertSupplierProfile(t.db, { domain: 'beta.com', leadTimeMinDays: 2, leadTimeMaxDays: 4, reliability: 0.6 });
    const again = await upsertSupplierProfile(t.db, { domain: 'beta.com', leadTimeMinDays: 5, leadTimeMaxDays: 9 });
    expect(again).toMatchObject({ leadTimeMinDays: 5, leadTimeMaxDays: 9, reliability: 0.6 });
    const defaulted = await upsertSupplierProfile(t.db, { domain: 'gamma.com', leadTimeMinDays: 1, leadTimeMaxDays: 1 });
    expect(defaulted.reliability).toBe(0.9);
  });

  it('lists the default first and rejects invalid input before touching the database', async () => {
    const all = await listSupplierProfiles(t.db);
    expect(all[0]!.domain).toBe('*');
    await expect(upsertSupplierProfile(t.db, { domain: 'x.com', leadTimeMinDays: 5, leadTimeMaxDays: 4 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(upsertSupplierProfile(t.db, { domain: 'x.com', leadTimeMinDays: -1, leadTimeMaxDays: 4 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(upsertSupplierProfile(t.db, { domain: 'x.com', leadTimeMinDays: 1, leadTimeMaxDays: 2, reliability: 1.5 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(upsertSupplierProfile(t.db, { domain: '  ', leadTimeMinDays: 1, leadTimeMaxDays: 2 })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('the database itself refuses an upper-case domain', async () => {
    await expect(
      t.db.query(`insert into supplier_profile (domain, lead_time_min_days, lead_time_max_days) values ('ABC.com', 1, 2)`),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('fails loudly instead of inventing a lead time when the default row is missing', async () => {
    await t.db.query(`delete from supplier_profile where domain = '*'`);
    await expect(getSupplierProfile(t.db, 'unknown-shop.example')).rejects.toMatchObject({ code: 'INTERNAL' });
    expect((await getSupplierProfile(t.db, 'acme.com')).domain).toBe('acme.com'); // a seeded domain still resolves
  });
});
