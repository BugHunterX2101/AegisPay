import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getDispute, getEvidenceBundle, getOrder, latestEvidenceBundle, transition, verifyChain, withTx } from '@aegis/db';
import type { EvidenceBundleRow } from '@aegis/db';
import { capture } from '../src/authorizations.ts';
import {
  assertBundleIntegrity,
  buildEvidenceBundle,
  evidenceAlreadySubmitted,
  fetchDispute,
  hasProvideEvidenceLink,
  orderStateForOutcome,
  reviewEvidenceBundle,
  submitEvidence,
  syncDispute,
} from '../src/disputes.ts';
import { authorizeHold, createHold } from '../src/orders.ts';
import { seedFulfillment, seedGatedOrder, startHarness } from './harness.ts';
import type { Harness } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  h.pp.seen.length = 0;
  h.pp.failures.length = 0;
  h.pp.provideEvidenceRel = 'provide-evidence';
  h.pp.alwaysOfferProvideEvidence = false;
  h.pp.acceptDuplicateEvidence = false;
  h.pp.delayMs = 0;
  h.sleeps.length = 0;
  h.writes.enabled = true;
  h.clock.offsetMs = 0;
});

const APP = 'https://aegispay.example';
const OWNER = 'owner@acme.test';
const NOTES = 'The carrier recorded delivery of all ten cables to the address on the order.';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as DomainError).code;
const evidencePosts = () => h.pp.seen.filter((c) => c.method === 'POST' && c.path.endsWith('/provide-evidence'));
const move = (id: string, from: Array<'HELD' | 'IN_TRANSIT' | 'SETTLED' | 'DISPUTED'>, to: 'IN_TRANSIT' | 'DELIVERED' | 'DISPUTED' | 'REFUNDED') =>
  withTx((tx) => transition(tx, id, from, to), h.t.db);
const state = async (id: string) => (await getOrder(h.t.db, id))!.state;
const auditRows = async (entityId: string) =>
  (await h.t.db.query<{ type: string; actor: string; payload: Record<string, unknown>; paypal_request_id: string | null }>(
    `select type, actor, payload, paypal_request_id from audit_event where entity_id = $1 order by seq`,
    [entityId],
  )).rows;
const auditTypes = async (entityId: string) => (await auditRows(entityId)).map((r) => r.type);

/** A real settled order: hold, approval, authorization, delivery record, capture. */
async function settled() {
  const s = await seedGatedOrder(h.t);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'USB-C cables' }, appUrl: APP });
  h.pp.approve(paypalOrderId);
  await authorizeHold(h.ctx, s.orderId, paypalOrderId, { approvedBy: OWNER });
  await move(s.orderId, ['HELD'], 'IN_TRANSIT');
  await move(s.orderId, ['IN_TRANSIT'], 'DELIVERED');
  await seedFulfillment(h.t, s.orderId);
  const cap = await capture(h.ctx, s.orderId);
  h.pp.seen.length = 0;
  return { ...s, captureId: cap.captureId };
}

/** Settled order + a dispute PayPal opened against its capture, synced into our books (order is now DISPUTED). */
async function disputed(o: { reason?: string; dueInMs?: number | null } = {}) {
  const s = await settled();
  const d = h.pp.addDispute({ captureId: s.captureId, ...o });
  const sync = await syncDispute(h.ctx, d.id);
  h.pp.seen.length = 0;
  return { ...s, disputeId: d.id, d, sync };
}

/** disputed() + a built and human-reviewed bundle. */
async function reviewed(o: { reason?: string } = {}) {
  const x = await disputed(o);
  const built = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
  if (built.status !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(built)}`);
  await reviewEvidenceBundle(h.ctx, built.bundle.id, 'reviewer@acme.test');
  h.pp.seen.length = 0;
  return { ...x, bundleId: built.bundle.id, bundle: built.bundle };
}

describe('reading a dispute from PayPal', () => {
  it('parses the fields it acts on from the live-shaped payload', async () => {
    const s = await settled();
    const d = h.pp.addDispute({ captureId: s.captureId, reason: 'UNAUTHORISED' });
    const r = await fetchDispute(h.ctx, d.id);
    expect(r).toMatchObject({ disputeId: d.id, reason: 'UNAUTHORISED', status: 'WAITING_FOR_SELLER_RESPONSE', lifeCycleStage: 'CHARGEBACK', outcomeCode: null, transactionIds: [s.captureId] });
    expect(r.sellerResponseDue).toBeInstanceOf(Date);
    expect(r.links.map((l) => l.rel)).toEqual(['self', 'provide-evidence']);
  });

  it('is a read: the kill switch does not block it', async () => {
    const s = await settled();
    const d = h.pp.addDispute({ captureId: s.captureId });
    h.writes.enabled = false;
    await expect(fetchDispute(h.ctx, d.id)).resolves.toMatchObject({ disputeId: d.id });
  });

  it('rejects a malformed id without calling PayPal', async () => {
    for (const bad of ['', 'a/b', '../x', 'a b', 'x?y=1']) expect(await code(fetchDispute(h.ctx, bad))).toBe('VALIDATION');
    expect(h.pp.seen).toHaveLength(0);
  });

  it('surfaces an unknown dispute as an error', async () => {
    await expect(fetchDispute(h.ctx, 'PP-D-NOPE')).rejects.toThrow();
  });

  it('treats a missing due date as null, not as a date', async () => {
    const s = await settled();
    const d = h.pp.addDispute({ captureId: s.captureId, dueInMs: null });
    expect((await fetchDispute(h.ctx, d.id)).sellerResponseDue).toBeNull();
  });

  it('recognises the provide-evidence link with hyphen or underscore, and nothing else', () => {
    expect(hasProvideEvidenceLink([{ href: 'x', rel: 'provide-evidence' }])).toBe(true);
    expect(hasProvideEvidenceLink([{ href: 'x', rel: 'PROVIDE_EVIDENCE' }])).toBe(true);
    expect(hasProvideEvidenceLink([{ href: 'x', rel: 'self' }, { href: 'y', rel: 'accept-claim' }])).toBe(false);
    expect(hasProvideEvidenceLink([])).toBe(false);
  });

  it('maps only the two outcome codes that say who won', () => {
    expect(orderStateForOutcome('RESOLVED_SELLER_FAVOUR')).toBe('RESOLVED_WON');
    expect(orderStateForOutcome('RESOLVED_BUYER_FAVOUR')).toBe('RESOLVED_LOST');
    expect(orderStateForOutcome('RESOLVED_WITH_PAYOUT')).toBeNull();
    expect(orderStateForOutcome('CANCELED_BY_BUYER')).toBeNull();
    expect(orderStateForOutcome(null)).toBeNull();
  });
});

describe('syncing a dispute into our books', () => {
  it('matches the order by capture id, stores the dispute and moves SETTLED to DISPUTED', async () => {
    const x = await disputed({ reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' });
    expect(x.sync).toMatchObject({ orderId: x.orderId, orderState: 'DISPUTED', changed: true, moved: 'DISPUTED' });
    expect(await state(x.orderId)).toBe('DISPUTED');
    const row = (await getDispute(h.t.db, x.disputeId))!;
    expect(row).toMatchObject({ orderId: x.orderId, reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', status: 'WAITING_FOR_SELLER_RESPONSE', outcome: null });
    expect(hasProvideEvidenceLink(row.links)).toBe(true);
    expect(await auditTypes(x.disputeId)).toContain('DISPUTE_SYNCED');
    expect(await auditTypes(x.orderId)).toContain('DISPUTE_OPENED');
  });

  it('a second sync with nothing new changes nothing and writes no audit row', async () => {
    const x = await disputed();
    // every PayPal call is itself audited (PAYPAL_CALL); what must not repeat is what the sync decides
    const decided = async () => [...(await auditRows(x.disputeId)), ...(await auditRows(x.orderId))].filter((r) => r.type !== 'PAYPAL_CALL').length;
    const before = await decided();
    const calls = (await auditTypes(x.disputeId)).filter((t) => t === 'PAYPAL_CALL').length;
    const again = await syncDispute(h.ctx, x.disputeId);
    expect(again).toMatchObject({ changed: false, moved: null, orderState: 'DISPUTED' });
    expect(await decided()).toBe(before);
    expect((await auditTypes(x.disputeId)).filter((t) => t === 'PAYPAL_CALL').length).toBe(calls + 1); // the read itself
  });

  it('a dispute against a capture that is not ours is stored but matched to no order, and says so', async () => {
    const s = await settled();
    const d = h.pp.addDispute({ captureId: s.captureId });
    d.transactionIds = ['CAPTURE-NOT-OURS'];
    const r = await syncDispute(h.ctx, d.id);
    expect(r).toMatchObject({ orderId: null, orderState: null, changed: true, moved: null });
    expect(await auditTypes(d.id)).toContain('DISPUTE_UNMATCHED');
    expect(await state(s.orderId)).toBe('SETTLED');
  });

  it('only a SETTLED order is moved: a refunded order is left alone', async () => {
    const s = await settled();
    await move(s.orderId, ['SETTLED'], 'REFUNDED');
    const d = h.pp.addDispute({ captureId: s.captureId });
    const r = await syncDispute(h.ctx, d.id);
    expect(r).toMatchObject({ orderId: s.orderId, orderState: 'REFUNDED', moved: null });
    expect(await state(s.orderId)).toBe('REFUNDED');
  });

  it('records a status change PayPal makes', async () => {
    const x = await disputed();
    x.d.status = 'UNDER_REVIEW';
    const r = await syncDispute(h.ctx, x.disputeId);
    expect(r.changed).toBe(true);
    expect((await getDispute(h.t.db, x.disputeId))!.status).toBe('UNDER_REVIEW');
  });

  it('PayPal deciding for the seller after evidence moves EVIDENCE_SUBMITTED to RESOLVED_WON', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    h.pp.resolveDispute(x.disputeId, 'RESOLVED_SELLER_FAVOUR');
    const r = await syncDispute(h.ctx, x.disputeId);
    expect(r).toMatchObject({ orderState: 'RESOLVED_WON', moved: 'RESOLVED_WON' });
    expect(await state(x.orderId)).toBe('RESOLVED_WON');
    expect(await auditTypes(x.orderId)).toContain('DISPUTE_RESOLVED');
  });

  it('PayPal deciding for the buyer after evidence moves it to RESOLVED_LOST', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    h.pp.resolveDispute(x.disputeId, 'RESOLVED_BUYER_FAVOUR');
    await syncDispute(h.ctx, x.disputeId);
    expect(await state(x.orderId)).toBe('RESOLVED_LOST');
  });

  it('an outcome code it does not map is recorded for a human and the order does not move', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    h.pp.resolveDispute(x.disputeId, 'RESOLVED_WITH_PAYOUT');
    const r = await syncDispute(h.ctx, x.disputeId);
    expect(r).toMatchObject({ orderState: 'EVIDENCE_SUBMITTED', moved: null });
    expect(await state(x.orderId)).toBe('EVIDENCE_SUBMITTED');
    expect(await auditTypes(x.disputeId)).toContain('DISPUTE_OUTCOME_UNMAPPED');
    // and the unmapped note is not repeated on every poll
    const n = (await auditTypes(x.disputeId)).filter((t) => t === 'DISPUTE_OUTCOME_UNMAPPED').length;
    await syncDispute(h.ctx, x.disputeId);
    expect((await auditTypes(x.disputeId)).filter((t) => t === 'DISPUTE_OUTCOME_UNMAPPED').length).toBe(n);
  });

  it('a dispute resolved before we answered stays DISPUTED, with an audit row for a human (no edge to RESOLVED_*)', async () => {
    const x = await disputed();
    h.pp.resolveDispute(x.disputeId, 'RESOLVED_BUYER_FAVOUR');
    const r = await syncDispute(h.ctx, x.disputeId);
    expect(r).toMatchObject({ orderState: 'DISPUTED', moved: null });
    expect(await state(x.orderId)).toBe('DISPUTED');
    expect(await auditTypes(x.disputeId)).toContain('DISPUTE_RESOLVED_WITHOUT_EVIDENCE');
  });

  it('keeps the audit chain valid', async () => {
    await reviewed();
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });
});

describe('building an evidence bundle', () => {
  it('plans, renders real PDFs and stores the bytes with their hashes before anything is sent', async () => {
    const x = await disputed({ reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' });
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error(JSON.stringify(r));

    const b = (await getEvidenceBundle(h.t.db, r.bundle.id))!;
    expect(b.disputeId).toBe(x.disputeId);
    expect(b.reviewedBy).toBeNull();
    expect(b.submittedAt).toBeNull();
    expect(b.files.length).toBeGreaterThan(0);
    for (const f of b.files) {
      const bytes = Buffer.from(f.bytes_base64, 'base64');
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(sha(bytes)).toBe(f.sha256);
      expect(f.mime).toBe('application/pdf');
    }
    expect(b.inputJson).toMatchObject({ evidences: [{ evidence_type: expect.any(String), notes: NOTES }] });
    expect(() => assertBundleIntegrity(b)).not.toThrow();
    expect(evidencePosts()).toHaveLength(0); // building sends nothing
    expect(h.pp.seen.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('audits who wrote the notes, the bundle hash and a hash of the notes, never the notes themselves', async () => {
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error('not built');
    const ev = (await auditRows(x.disputeId)).find((e) => e.type === 'EVIDENCE_BUNDLE_BUILT')!;
    expect(ev.actor).toBe('agent:defense');
    expect(ev.payload).toMatchObject({ bundleId: r.bundle.id, bundleSha256: r.bundle.sha256, notesSha256: sha(NOTES) });
    expect(JSON.stringify(ev.payload)).not.toContain(NOTES);
  });

  it('prefixes a bare author name with user:', async () => {
    const x = await disputed();
    await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'alice@acme.test');
    const ev = (await auditRows(x.disputeId)).find((e) => e.type === 'EVIDENCE_BUNDLE_BUILT')!;
    expect(ev.actor).toBe('user:alice@acme.test');
  });

  it('stores each build as its own bundle, newest first', async () => {
    const x = await disputed();
    const a = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    const b = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (a.status !== 'BUILT' || b.status !== 'BUILT') throw new Error('not built');
    expect(a.bundle.id).not.toBe(b.bundle.id);
    expect(a.bundle.files.map((f) => f.name)).toEqual(b.bundle.files.map((f) => f.name));
    expect(a.bundle.sha256).toHaveLength(64);
    expect((await latestEvidenceBundle(h.t.db, x.disputeId))!.id).toBe(b.bundle.id);
  });

  it('is BLOCKED, with an audit row and no bundle, when the tracking record the reason needs is missing', async () => {
    const x = await disputed({ reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' });
    await h.t.db.query('delete from fulfillment where order_id = $1', [x.orderId]);
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    expect(r).toMatchObject({ status: 'BLOCKED', missing: expect.arrayContaining(['tracking_info']) });
    expect(await latestEvidenceBundle(h.t.db, x.disputeId)).toBeNull();
    const ev = (await auditRows(x.disputeId)).find((e) => e.type === 'EVIDENCE_BLOCKED')!;
    expect(ev.payload).toMatchObject({ missing: expect.arrayContaining(['tracking_info']) });
  });

  it('a reason that needs a stored catalog snapshot is BLOCKED when there is none', async () => {
    const x = await disputed({ reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED' }); // seeded proposals carry no snapshot
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    expect(r).toMatchObject({ status: 'BLOCKED', missing: expect.arrayContaining(['product_snapshot']) });
  });

  it('refuses blank or over-long notes and stores nothing', async () => {
    const x = await disputed();
    expect(await code(buildEvidenceBundle(h.ctx, x.disputeId, '   ', 'agent:defense'))).toBe('VALIDATION');
    expect(await code(buildEvidenceBundle(h.ctx, x.disputeId, 'x'.repeat(2001), 'agent:defense'))).toBe('VALIDATION');
    expect(await code(buildEvidenceBundle(h.ctx, x.disputeId, NOTES, '  '))).toBe('VALIDATION');
    expect(await latestEvidenceBundle(h.t.db, x.disputeId)).toBeNull();
  });

  it('accepts notes of exactly 2,000 characters', async () => {
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, 'y'.repeat(2000), 'agent:defense');
    expect(r.status).toBe('BUILT');
  });

  it('refuses a dispute that has not been synced, is unmatched, or whose order is no longer DISPUTED', async () => {
    expect(await code(buildEvidenceBundle(h.ctx, 'PP-D-NEVER-SYNCED', NOTES, 'agent:defense'))).toBe('NOT_FOUND');

    const s = await settled();
    const d = h.pp.addDispute({ captureId: s.captureId });
    d.transactionIds = ['CAPTURE-NOT-OURS'];
    await syncDispute(h.ctx, d.id);
    expect(await code(buildEvidenceBundle(h.ctx, d.id, NOTES, 'agent:defense'))).toBe('BAD_STATE');

    const x = await disputed();
    await move(x.orderId, ['DISPUTED'], 'REFUNDED');
    expect(await code(buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense'))).toBe('BAD_STATE');
  });
});

describe('the integrity check', () => {
  async function built(): Promise<EvidenceBundleRow> {
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error('not built');
    return r.bundle;
  }
  const fails = (b: EvidenceBundleRow) => {
    try {
      assertBundleIntegrity(b);
    } catch (e) {
      return e as DomainError;
    }
    return null;
  };

  it('passes an untouched bundle', async () => {
    expect(fails(await built())).toBeNull();
  });

  it('catches a file whose bytes no longer match their recorded hash', async () => {
    const b = await built();
    const f = b.files[0]!;
    const bytes = Buffer.from(f.bytes_base64, 'base64');
    bytes[bytes.length - 2] = bytes[bytes.length - 2]! ^ 0xff;
    const e = fails({ ...b, files: [{ ...f, bytes_base64: bytes.toString('base64') }, ...b.files.slice(1)] });
    expect(e?.code).toBe('INTERNAL');
    expect(e?.message).toMatch(/recorded hash/);
  });

  it('catches changed notes (the bundle hash covers the input)', async () => {
    const b = await built();
    const e = fails({ ...b, inputJson: { evidences: [{ evidence_type: 'PROOF_OF_FULFILLMENT', notes: 'something else' }] } });
    expect(e?.message).toMatch(/bundle hash/);
  });

  it('catches a non-PDF file and an odd file name', async () => {
    const b = await built();
    const f = b.files[0]!;
    expect(fails({ ...b, files: [{ ...f, mime: 'image/png' }] })?.message).toMatch(/only PDFs/);
    expect(fails({ ...b, files: [{ ...f, name: '../evil.pdf' }] })?.message).toMatch(/unexpected file name/);
  });

  it('catches more than three files', async () => {
    const b = await built();
    const f = b.files[0]!;
    expect(fails({ ...b, files: [f, f, f, f] })?.message).toMatch(/limit is 3/);
  });

  it('catches an input with no evidences, missing notes, or notes over the limit', async () => {
    const b = await built();
    // the bundle hash is checked first, so each case is rebuilt with a recomputed hash
    const { bundleSha256 } = await import('../src/evidence/pdf.ts');
    const rehash = (inputJson: unknown): EvidenceBundleRow => ({ ...b, inputJson, sha256: bundleSha256(inputJson, b.files) });
    expect(fails(rehash({ evidences: [] }))?.message).toMatch(/no evidences/);
    expect(fails(rehash({}))?.message).toMatch(/no evidences/);
    expect(fails(rehash({ evidences: [{ evidence_type: 'OTHER' }] }))?.message).toMatch(/no notes/);
    expect(fails(rehash({ evidences: [{ evidence_type: 'OTHER', notes: 'z'.repeat(2001) }] }))?.message).toMatch(/limit is 2000/);
    expect(fails(rehash({ evidences: [{ evidence_type: 'OTHER', notes: 'z'.repeat(2000) }] }))).toBeNull();
    // an edit that was not re-hashed is caught by the hash instead
    expect(fails({ ...b, inputJson: { evidences: [{ evidence_type: 'OTHER', notes: NOTES }] } })?.message).toMatch(/bundle hash/);
  });
});

describe('human review', () => {
  it('needs a named human', async () => {
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error('not built');
    expect(await code(reviewEvidenceBundle(h.ctx, r.bundle.id, '  '))).toBe('FORBIDDEN');
    expect((await getEvidenceBundle(h.t.db, r.bundle.id))!.reviewedBy).toBeNull();
  });

  it('records the reviewer and audits the exact hashes they attested to', async () => {
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error('not built');
    const out = await reviewEvidenceBundle(h.ctx, r.bundle.id, ' reviewer@acme.test ');
    expect(out.reviewedBy).toBe('reviewer@acme.test');
    expect((await getEvidenceBundle(h.t.db, r.bundle.id))!.reviewedBy).toBe('reviewer@acme.test');
    const ev = (await auditRows(x.disputeId)).find((e) => e.type === 'EVIDENCE_REVIEWED')!;
    expect(ev.actor).toBe('user:reviewer@acme.test');
    expect(ev.payload).toMatchObject({ bundleId: r.bundle.id, bundleSha256: r.bundle.sha256 });
  });

  it('refuses an unknown bundle, and a bundle whose stored bytes were altered', async () => {
    expect(await code(reviewEvidenceBundle(h.ctx, '00000000-0000-7000-8000-000000000000', 'r@acme.test'))).toBe('NOT_FOUND');
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error('not built');
    const tampered = r.bundle.files.map((f) => ({ ...f, bytes_base64: Buffer.from('not the pdf that was hashed').toString('base64') }));
    await h.t.db.query('update evidence_bundle set files = $2::jsonb where id = $1', [r.bundle.id, JSON.stringify(tampered)]);
    expect(await code(reviewEvidenceBundle(h.ctx, r.bundle.id, 'r@acme.test'))).toBe('INTERNAL');
    expect((await getEvidenceBundle(h.t.db, r.bundle.id))!.reviewedBy).toBeNull();
  });

  it('refuses a bundle that was already submitted', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(await code(reviewEvidenceBundle(h.ctx, x.bundleId, 'someone@acme.test'))).toBe('BAD_STATE');
  });
});

describe('submitting evidence', () => {
  it('sends exactly the stored bytes as multipart, then moves the order to EVIDENCE_SUBMITTED', async () => {
    const x = await reviewed();
    const r = await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(r).toMatchObject({ bundleId: x.bundleId, disputeId: x.disputeId, orderId: x.orderId });

    // what PayPal received, byte for byte
    expect(x.d.received).toHaveLength(1);
    const got = x.d.received[0]!;
    expect(got.input).toEqual(x.bundle.inputJson);
    expect(got.files.map((f) => f.name)).toEqual(x.bundle.files.map((_, i) => `file${i + 1}`));
    got.files.forEach((p, i) => {
      const stored = x.bundle.files[i]!;
      expect(p.filename).toBe(stored.name);
      expect(p.contentType).toBe('application/pdf');
      expect(sha(p.bytes)).toBe(stored.sha256);
    });

    // our books
    expect(await state(x.orderId)).toBe('EVIDENCE_SUBMITTED');
    const b = (await getEvidenceBundle(h.t.db, x.bundleId))!;
    expect(b.submittedAt).toBeInstanceOf(Date);
    expect(b.paypalResponse).toMatchObject({ links: expect.any(Array) });
    expect(await evidenceAlreadySubmitted(h.ctx, x.disputeId)).toBe(true);
  });

  it('audits the submitter, the reviewer, the file hashes and PayPal request id, and the chain verifies', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    const ev = (await auditRows(x.disputeId)).find((e) => e.type === 'EVIDENCE_SUBMITTED')!;
    expect(ev.actor).toBe(`user:${OWNER}`);
    expect(ev.paypal_request_id).toEqual(expect.any(String));
    expect(ev.payload).toMatchObject({
      bundleId: x.bundleId,
      bundleSha256: x.bundle.sha256,
      reviewedBy: 'reviewer@acme.test',
      orderId: x.orderId,
      statusCode: 200,
      wasInState: 'WAITING_FOR_SELLER_RESPONSE',
      files: x.bundle.files.map((f) => ({ name: f.name, sha256: f.sha256 })),
    });
    expect((await verifyChain(h.t.db)).ok).toBe(true);
  });

  it('refuses a bundle no human has reviewed, and sends nothing', async () => {
    const x = await disputed();
    const r = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (r.status !== 'BUILT') throw new Error('not built');
    expect(await code(submitEvidence(h.ctx, r.bundle.id, OWNER))).toBe('FORBIDDEN');
    expect(h.pp.seen).toHaveLength(0);
    expect(await state(x.orderId)).toBe('DISPUTED');
  });

  it('needs a named submitter and a known bundle', async () => {
    const x = await reviewed();
    expect(await code(submitEvidence(h.ctx, x.bundleId, ' '))).toBe('FORBIDDEN');
    expect(await code(submitEvidence(h.ctx, '00000000-0000-7000-8000-000000000000', OWNER))).toBe('NOT_FOUND');
    expect(h.pp.seen).toHaveLength(0);
  });

  it('is blocked by the kill switch after the read and before the write, changing nothing', async () => {
    const x = await reviewed();
    h.writes.enabled = false;
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('WRITES_DISABLED');
    expect(evidencePosts()).toHaveLength(0);
    expect(x.d.received).toHaveLength(0);
    expect(await state(x.orderId)).toBe('DISPUTED');
    expect((await getEvidenceBundle(h.t.db, x.bundleId))!.submittedAt).toBeNull();
  });

  it('refuses when PayPal no longer shows the seller’s turn, judged on a fresh GET, not on what we stored', async () => {
    const x = await reviewed();
    x.d.status = 'UNDER_REVIEW'; // PayPal moved on; our stored row still says WAITING_FOR_SELLER_RESPONSE
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(evidencePosts()).toHaveLength(0);
    expect(await state(x.orderId)).toBe('DISPUTED');
  });

  it('refuses on the status alone, even if PayPal still offers the provide-evidence link', async () => {
    const x = await reviewed();
    h.pp.alwaysOfferProvideEvidence = true;
    x.d.status = 'UNDER_REVIEW';
    await expect(submitEvidence(h.ctx, x.bundleId, OWNER)).rejects.toThrow(/not WAITING_FOR_SELLER_RESPONSE/);
    expect(evidencePosts()).toHaveLength(0);
  });

  it('refuses a bundle already marked submitted even when order and PayPal both look submittable again', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    // Put everything else back to a submittable state; only the bundle's own submitted flag remains.
    await h.t.db.query(`update purchase_order set state = 'DISPUTED' where id = $1`, [x.orderId]);
    x.d.status = 'WAITING_FOR_SELLER_RESPONSE';
    await expect(submitEvidence(h.ctx, x.bundleId, OWNER)).rejects.toThrow(/already submitted/);
    expect(evidencePosts()).toHaveLength(1);
  });

  it('refuses when PayPal offers no provide-evidence link', async () => {
    const x = await reviewed();
    h.pp.provideEvidenceRel = 'accept-claim';
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(evidencePosts()).toHaveLength(0);
  });

  it('accepts the link when PayPal spells the rel with an underscore', async () => {
    const x = await reviewed();
    h.pp.provideEvidenceRel = 'provide_evidence';
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(x.d.received).toHaveLength(1);
  });

  it('refuses once the response window has closed', async () => {
    const x = await reviewed();
    x.d.dueDate = new Date(Date.now() - 60_000).toISOString();
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(evidencePosts()).toHaveLength(0);
  });

  it('refuses when our clock says the window has closed, even though PayPal’s date is still in the future', async () => {
    const x = await reviewed();
    h.clock.offsetMs = 11 * 86_400_000; // dispute was created with a 10-day window
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(evidencePosts()).toHaveLength(0);
  });

  it('allows a dispute with no due date (nothing to compare against)', async () => {
    const x = await disputed({ dueInMs: null });
    const built = await buildEvidenceBundle(h.ctx, x.disputeId, NOTES, 'agent:defense');
    if (built.status !== 'BUILT') throw new Error('not built');
    await reviewEvidenceBundle(h.ctx, built.bundle.id, 'reviewer@acme.test');
    await submitEvidence(h.ctx, built.bundle.id, OWNER);
    expect(x.d.received).toHaveLength(1);
  });

  it('refuses a dispute PayPal has already resolved', async () => {
    const x = await reviewed();
    h.pp.resolveDispute(x.disputeId, 'RESOLVED_BUYER_FAVOUR');
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(evidencePosts()).toHaveLength(0);
  });

  it('refuses an order that is no longer DISPUTED', async () => {
    const x = await reviewed();
    await move(x.orderId, ['DISPUTED'], 'REFUNDED');
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(evidencePosts()).toHaveLength(0);
  });

  it('refuses a bundle whose stored bytes changed after review', async () => {
    const x = await reviewed();
    const tampered = x.bundle.files.map((f) => ({ ...f, bytes_base64: Buffer.from('swapped after review').toString('base64') }));
    await h.t.db.query('update evidence_bundle set files = $2::jsonb where id = $1', [x.bundleId, JSON.stringify(tampered)]);
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('INTERNAL');
    expect(evidencePosts()).toHaveLength(0);
    expect(await state(x.orderId)).toBe('DISPUTED');
  });

  it('a second submission of the same bundle is refused and PayPal receives the evidence once', async () => {
    const x = await reviewed();
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
    expect(x.d.received).toHaveLength(1);
    expect(evidencePosts()).toHaveLength(1);
  });

  it('two concurrent submitters cannot both send it', async () => {
    const x = await reviewed();
    const results = await Promise.allSettled([submitEvidence(h.ctx, x.bundleId, OWNER), submitEvidence(h.ctx, x.bundleId, 'other@acme.test')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(x.d.received).toHaveLength(1);
    expect(await state(x.orderId)).toBe('EVIDENCE_SUBMITTED');
  });

  it('our own row locks stop a duplicate send even when PayPal would accept it twice', async () => {
    const x = await reviewed();
    h.pp.acceptDuplicateEvidence = true;
    h.pp.delayMs = 60; // both submitters are inside PayPal's GET at the same time
    const results = await Promise.allSettled([submitEvidence(h.ctx, x.bundleId, OWNER), submitEvidence(h.ctx, x.bundleId, 'other@acme.test')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(x.d.received).toHaveLength(1);
    expect(evidencePosts()).toHaveLength(1);
  });

  it('a PayPal rejection leaves the order DISPUTED and the bundle unsubmitted, so it can be fixed and retried', async () => {
    const x = await reviewed();
    h.pp.failures.push({
      match: /POST \/v1\/customer\/disputes\/.+\/provide-evidence/,
      count: 1,
      status: 422,
      body: { name: 'UNPROCESSABLE_ENTITY', message: 'The requested action could not be performed.', debug_id: 'dbg-x', details: [{ issue: 'MODELLED_REJECTION' }] },
    });
    await expect(submitEvidence(h.ctx, x.bundleId, OWNER)).rejects.toThrow();
    expect(x.d.received).toHaveLength(0);
    expect(await state(x.orderId)).toBe('DISPUTED');
    expect((await getEvidenceBundle(h.t.db, x.bundleId))!.submittedAt).toBeNull();
    expect(await auditTypes(x.disputeId)).not.toContain('EVIDENCE_SUBMITTED');

    await submitEvidence(h.ctx, x.bundleId, OWNER); // the failure was one-shot; the retry goes through
    expect(x.d.received).toHaveLength(1);
    expect(await state(x.orderId)).toBe('EVIDENCE_SUBMITTED');
  });

  it('a 5xx on the evidence POST is NOT retried (PayPal cannot recognise a replay), and the bundle stays unsubmitted', async () => {
    const x = await reviewed();
    h.pp.failures.push({ match: /POST \/v1\/customer\/disputes\/.+\/provide-evidence/, count: 1, status: 503 });
    const err = (await submitEvidence(h.ctx, x.bundleId, OWNER).catch((e: unknown) => e)) as DomainError;
    expect(err.code).toBe('PAYPAL_ERROR');
    expect(h.sleeps).toHaveLength(0); // no back-off, because there was no retry
    expect(h.pp.seen.filter((c) => c.method === 'POST' && c.path.endsWith('/provide-evidence'))).toHaveLength(1);
    expect(x.d.received).toHaveLength(0);
    expect(await state(x.orderId)).toBe('DISPUTED');
    // A person can submit again once they have looked at PayPal; nothing was marked submitted.
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(x.d.received).toHaveLength(1);
  });

  it('crash window: PayPal accepted the evidence but our commit failed, so the next submit finishes locally and sends nothing', async () => {
    const x = await reviewed();
    // Make the local commit fail AFTER PayPal has answered 2xx (the audit row of the successful call is written in its own transaction).
    await h.t.db.query(`create function fail_submit() returns trigger language plpgsql as $$ begin raise exception 'simulated crash after PayPal accepted'; end $$`);
    await h.t.db.query(
      `create trigger fail_submit before update of submitted_at on evidence_bundle for each row when (new.submitted_at is not null) execute function fail_submit()`,
    );
    try {
      await expect(submitEvidence(h.ctx, x.bundleId, OWNER)).rejects.toThrow(/simulated crash/);
    } finally {
      await h.t.db.query('drop trigger fail_submit on evidence_bundle');
      await h.t.db.query('drop function fail_submit()');
    }
    expect(x.d.received).toHaveLength(1); // PayPal has it
    expect(await state(x.orderId)).toBe('DISPUTED'); // we do not know yet
    expect((await h.t.db.query('select submitted_at from evidence_bundle where id = $1', [x.bundleId])).rows[0].submitted_at).toBeNull();

    h.pp.seen.length = 0;
    const r = await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(h.pp.seen).toHaveLength(0); // no GET, no POST: nothing went to PayPal
    expect(x.d.received).toHaveLength(1); // still exactly one copy at PayPal
    expect(r.paypalResponse).toBeNull();
    expect(await state(x.orderId)).toBe('EVIDENCE_SUBMITTED');
    expect((await h.t.db.query('select submitted_at from evidence_bundle where id = $1', [x.bundleId])).rows[0].submitted_at).not.toBeNull();
    expect(await auditTypes(x.disputeId)).toContain('EVIDENCE_SUBMIT_RECOVERED');
    expect(await auditTypes(x.disputeId)).not.toContain('EVIDENCE_SUBMITTED');
    // and it cannot be recovered twice
    expect(await code(submitEvidence(h.ctx, x.bundleId, OWNER))).toBe('BAD_STATE');
  });

  it('a failed send leaves no accepted-call row, so it is not mistaken for a crash-window success', async () => {
    const x = await reviewed();
    h.pp.failures.push({ match: /POST \/v1\/customer\/disputes\/.+\/provide-evidence/, count: 1, status: 503 });
    await submitEvidence(h.ctx, x.bundleId, OWNER).catch(() => undefined);
    h.pp.seen.length = 0;
    await submitEvidence(h.ctx, x.bundleId, OWNER); // a real second attempt: GET + POST
    expect(h.pp.seen.some((c) => c.method === 'POST' && c.path.endsWith('/provide-evidence'))).toBe(true);
    expect(x.d.received).toHaveLength(1);
    expect(await auditTypes(x.disputeId)).toContain('EVIDENCE_SUBMITTED');
    expect(await auditTypes(x.disputeId)).not.toContain('EVIDENCE_SUBMIT_RECOVERED');
  });

  it('a manual-review reason (anything unrecognised) still builds, reviews and submits', async () => {
    const x = await reviewed({ reason: 'SOMETHING_PAYPAL_ADDS_LATER' });
    await submitEvidence(h.ctx, x.bundleId, OWNER);
    expect(x.d.received[0]!.input).toMatchObject({ evidences: [{ evidence_type: 'OTHER' }] });
  });
});
