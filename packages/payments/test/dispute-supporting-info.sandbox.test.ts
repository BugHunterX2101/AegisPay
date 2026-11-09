import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOrder, recordDelivery, recordShipment, transition, verifyChain, withTx } from '@aegis/db';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { createPayPalContext } from '../src/client.ts';
import type { PayPalContext } from '../src/client.ts';
import { SANDBOX_BASE_URL, loadPayPalConfig } from '../src/config.ts';
import { SUPPORTING_INFO_STAGES, buildEvidenceBundle, fetchDispute, hasSupportingInfoLink, reviewEvidenceBundle, submitEvidence, syncDispute } from '../src/disputes.ts';
import { seedGatedOrder } from './harness.ts';

/**
 * LIVE check of the seller's answer to a dispute PayPal is reviewing: POST /v1/customer/disputes/{id}/provide-supporting-info,
 * against the PayPal SANDBOX (fake money). Opt in with SANDBOX_WRITES=1.
 *
 * Only a buyer can open a dispute, so this test does not open one. It takes, from PayPal's live list, an open dispute
 * that offers `provide_supporting_info` in a CHARGEBACK / PRE_ARBITRATION / ARBITRATION stage, and rebuilds the order
 * behind it in a fresh local ledger from PayPal's own records: the capture, its authorization and order, the item and
 * amount, and the tracking number already registered with PayPal on that order. The carrier is not readable from
 * PayPal, so the fixture says OTHER, and delivery is SIMULATED as every sandbox delivery is. The notes sent to PayPal
 * say that this is a contract test.
 *
 * From there it is the product's own code against the real sandbox: syncDispute (live GET, SETTLED -> DISPUTED),
 * buildEvidenceBundle (picks provide-supporting-info from PayPal's live links), a named human's review, submitEvidence
 * (live GET, then the multipart POST), and the read-back of what PayPal now lists.
 *
 * PayPal may stop offering the action once it has been answered. With no dispute that offers it, the test skips and
 * says why; it never fakes one.
 *
 * Every run that reaches the POST adds another supporting-info entry to a real (sandbox) dispute, so it needs its own
 * flag on top of SANDBOX_WRITES=1 and is not part of a plain `pnpm test:sandbox`:
 *   SANDBOX_WRITES=1 SANDBOX_DISPUTE_WRITES=1 pnpm vitest run -c vitest.sandbox.config.ts packages/payments/test/dispute-supporting-info.sandbox.test.ts
 * Do not re-run it to retry a failure: PayPal may already have accepted the answer. Read the dispute first.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const enabled =
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.SANDBOX_WRITES === '1' && process.env.SANDBOX_DISPUTE_WRITES === '1';
const RESULT_FILE = join(tmpdir(), 'aegis-supporting-info.json');

interface Target {
  disputeId: string;
  reason: string;
  captureId: string;
  paypalOrderId: string;
  authorizationId: string;
  authCreatedAt: string;
  capturedAt: string;
  amountMinor: bigint;
  currency: string;
  title: string;
  trackingNumber: string;
}

describe.skipIf(!enabled)('PayPal sandbox dispute: provide-supporting-info (live; needs SANDBOX_WRITES=1 and SANDBOX_DISPUTE_WRITES=1)', { timeout: 180_000 }, () => {
  let t: TestDb;
  let ctx: PayPalContext;
  let target: Target | null = null;
  let whyNone = '';

  async function get<T>(path: string): Promise<T> {
    const tok = await ctx.vault.getToken();
    const r = await fetch(`${SANDBOX_BASE_URL}${path}`, { headers: { authorization: `${tok.tokenType} ${tok.accessToken}` } });
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
    return (await r.json()) as T;
  }

  /** The first open dispute PayPal would accept supporting information on, with the order behind it read from PayPal. */
  async function findTarget(): Promise<Target | null> {
    type Money = { currency_code: string; value: string };
    const list = await get<{ items?: Array<{ dispute_id: string; status: string }> }>('/v1/customer/disputes?page_size=50');
    const open = (list.items ?? []).filter((d) => d.status !== 'RESOLVED');
    if (!open.length) {
      whyNone = 'the sandbox merchant has no open dispute';
      return null;
    }
    for (const d of open) {
      const live = await fetchDispute(ctx, d.dispute_id);
      if (!hasSupportingInfoLink(live.links) || !SUPPORTING_INFO_STAGES.has(live.lifeCycleStage ?? '')) continue;
      const captureId = live.transactionIds[0];
      if (!captureId) continue;
      const cap = await get<{ amount: Money; create_time: string; supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } } }>(`/v2/payments/captures/${captureId}`);
      const paypalOrderId = cap.supplementary_data?.related_ids?.order_id;
      const authorizationId = cap.supplementary_data?.related_ids?.authorization_id;
      if (!paypalOrderId || !authorizationId) continue;
      const auth = await get<{ create_time: string }>(`/v2/payments/authorizations/${authorizationId}`);
      const order = await get<{ purchase_units?: Array<{ items?: Array<{ name: string }>; description?: string; shipping?: { trackers?: Array<{ id: string }> } }> }>(`/v2/checkout/orders/${paypalOrderId}`);
      const pu = order.purchase_units?.[0];
      // PayPal's tracker id is `<capture id>-<tracking number>`.
      const tracker = pu?.shipping?.trackers?.find((x) => x.id.startsWith(`${captureId}-`));
      if (!tracker) {
        whyNone = `dispute ${d.dispute_id} offers supporting info, but its order carries no tracking number at PayPal`;
        continue;
      }
      const [units, cents = ''] = cap.amount.value.split('.');
      return {
        disputeId: d.dispute_id,
        reason: live.reason ?? 'UNKNOWN',
        captureId,
        paypalOrderId,
        authorizationId,
        authCreatedAt: auth.create_time,
        capturedAt: cap.create_time,
        amountMinor: BigInt(units!) * 100n + BigInt(cents.padEnd(2, '0').slice(0, 2)),
        currency: cap.amount.currency_code,
        title: pu?.items?.[0]?.name ?? pu?.description ?? 'not recorded',
        trackingNumber: tracker.id.slice(captureId.length + 1),
      };
    }
    whyNone ||= 'no open dispute offers provide_supporting_info in a CHARGEBACK, PRE_ARBITRATION or ARBITRATION stage (PayPal may have stopped offering it once answered)';
    return null;
  }

  beforeAll(async () => {
    t = await freshDb();
    const config = loadPayPalConfig({ ...process.env, PAYPAL_BASE_URL: SANDBOX_BASE_URL });
    ctx = createPayPalContext({ db: t.db, config, deps: { writesEnabled: () => true } });
    target = await findTarget();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('answers a live CHARGEBACK under review with provide-supporting-info, and PayPal lists it afterwards', async (c) => {
    if (!target) {
      writeFileSync(RESULT_FILE, JSON.stringify({ skipped: whyNone }, null, 2));
      c.skip(whyNone);
      return;
    }
    const tg = target;
    expect(tg.currency).toBe('USD'); // the ledger is USD-only

    // The order behind the dispute, rebuilt from PayPal's records and walked through the real state machine.
    const s = await seedGatedOrder(t, { unit: tg.amountMinor, quantity: 1, shipping: 0n, tax: 0n, title: tg.title });
    await withTx(async (tx) => {
      expect(await transition(tx, s.orderId, ['AWAITING_APPROVAL'], 'HELD', { paypalOrderId: tg.paypalOrderId, authorizationId: tg.authorizationId, authCreatedAt: new Date(tg.authCreatedAt), appendAuthorizationId: tg.authorizationId })).toBe('APPLIED');
    }, t.db);
    await withTx((tx) => recordShipment(tx, s.orderId, { carrier: 'OTHER', trackingNumber: tg.trackingNumber, actor: 'test:fixture' }), t.db);
    await withTx((tx) => recordDelivery(tx, s.orderId, { actor: 'test:fixture' }), t.db);
    await withTx(async (tx) => {
      expect(await transition(tx, s.orderId, ['DELIVERED'], 'SETTLED', { captureId: tg.captureId })).toBe('APPLIED');
    }, t.db);

    // 1. Sync from PayPal: the capture id matches, the order moves to DISPUTED, the live links are stored.
    const sync = await syncDispute(ctx, tg.disputeId);
    expect(sync.orderId).toBe(s.orderId);
    expect(sync.moved).toBe('DISPUTED');
    expect(hasSupportingInfoLink(sync.dispute.links)).toBe(true);

    // 2. Build: the body is chosen from PayPal's live links, so it is {notes}, not {evidences}.
    const notes = [
      'AegisPay sandbox contract test (PayPal sandbox, fake money): this answer exercises the seller provide-supporting-info path.',
      `The order was paid through a PayPal authorization hold that the buyer approved (order ${tg.paypalOrderId}, authorization ${tg.authorizationId}) and captured on ${tg.capturedAt.slice(0, 10)} for $${(Number(tg.amountMinor) / 100).toFixed(2)} (capture ${tg.captureId}).`,
      `The item ordered was "${tg.title}".`,
      `It shipped with tracking number ${tg.trackingNumber}, already registered with PayPal on this order.`,
      'Delivery was recorded by the seller\'s operator (a simulated carrier event, not a carrier report). The fulfillment record is attached.',
    ].join(' ');
    const built = await buildEvidenceBundle(ctx, tg.disputeId, notes, 'user:sandbox-test');
    if (built.status !== 'BUILT') throw new Error(`evidence blocked: ${built.reason} (missing ${built.missing.join(', ')})`);
    expect(built.bundle.inputJson).toEqual({ notes });
    expect(built.bundle.files.map((f) => f.name)).toEqual(['fulfillment-record.pdf']);

    // 3. A named human attests to the bundle hash. 4. Submit: live GET, then the real multipart POST.
    await reviewEvidenceBundle(ctx, built.bundle.id, 'owner@acme.test');
    let sent: Awaited<ReturnType<typeof submitEvidence>>;
    try {
      sent = await submitEvidence(ctx, built.bundle.id, 'owner@acme.test');
    } catch (err) {
      // Keep PayPal's refusal before afterAll drops the database: the error, and the call rows filed under the bundle
      // (HTTP status, PayPal debug id).
      const calls = await t.db.query(`select type, payload, paypal_request_id, paypal_debug_id from audit_event where entity_id = $1 order by seq`, [built.bundle.id]);
      const e = err as { code?: string; message?: string; details?: unknown; paypalDebugId?: string; paypalName?: string };
      writeFileSync(RESULT_FILE, JSON.stringify({ failed: { code: e.code, message: e.message, details: e.details, paypalName: e.paypalName, paypalDebugId: e.paypalDebugId }, calls: calls.rows }, null, 2));
      throw err;
    }
    expect(sent.orderId).toBe(s.orderId);
    expect((await getOrder(t.db, s.orderId))!.state).toBe('EVIDENCE_SUBMITTED');

    const audit = async (type: string) =>
      (await t.db.query<{ payload: Record<string, unknown>; paypal_request_id: string | null; paypal_debug_id: string | null }>(
        `select payload, paypal_request_id, paypal_debug_id from audit_event where type = $1 and entity_id = $2 order by seq desc limit 1`,
        [type, tg.disputeId],
      )).rows[0];
    const submitted = await audit('EVIDENCE_SUBMITTED');
    const readback = await audit('EVIDENCE_READBACK');
    const after = await fetchDispute(ctx, tg.disputeId);
    const result = {
      disputeId: tg.disputeId,
      reason: tg.reason,
      submitted: { statusCode: submitted?.payload.statusCode, target: submitted?.payload.target, wasInState: submitted?.payload.wasInState, wasInStage: submitted?.payload.wasInStage, before: submitted?.payload.before, paypalDebugId: submitted?.paypal_debug_id },
      readback: readback?.payload,
      paypalNow: { status: after.status, stage: after.lifeCycleStage, supportingInfo: after.supportingInfoCount, evidences: after.evidenceCount, offered: after.links.map((l) => l.rel) },
    };
    console.log('provide-supporting-info ->', result);
    // Vitest hides console output of passing tests, so keep PayPal's answer in a file as well.
    writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));

    expect(submitted?.payload.target).toBe('provide-supporting-info');
    expect(submitted?.payload.statusCode).toBe(200);
    expect(readback?.payload.confirmed).toBe(true); // PayPal lists one more supporting_info entry than before
    expect((await verifyChain(t.db)).ok).toBe(true);
  });
});
