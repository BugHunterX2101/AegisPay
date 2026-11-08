import { randomBytes } from 'node:crypto';
import type { Clock } from '@aegis/core';
import { insertOrder, transition, uuidv7, withTx } from '@aegis/db';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { createPayPalContext } from '../src/client.ts';
import type { PayPalContext } from '../src/client.ts';
import { startOAuthServer } from './oauth-server.ts';
import type { OAuthServer } from './oauth-server.ts';
import { sdkAdapter, startPayPalServer } from './paypal-server.ts';
import type { PayPalServer } from './paypal-server.ts';

export const CLIENT_ID = 'AbC-client-id';
export const CLIENT_SECRET = 'S3cret/with+chars=';

/** Wall-clock plus an adjustable offset (the local PayPal server uses real time for authorization expiry). */
export class OffsetClock implements Clock {
  offsetMs = 0;
  now() {
    return new Date(Date.now() + this.offsetMs);
  }
}

export interface Harness {
  t: TestDb;
  oauth: OAuthServer;
  pp: PayPalServer;
  ctx: PayPalContext;
  clock: OffsetClock;
  sleeps: number[];
  writes: { enabled: boolean };
  close(): Promise<void>;
}

/** Real Postgres + real local OAuth server + local PayPal-contract server, wired through the real SDK. */
export async function startHarness(): Promise<Harness> {
  const t = await freshDb();
  const oauth = await startOAuthServer({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  const pp = await startPayPalServer();
  const clock = new OffsetClock();
  const sleeps: number[] = [];
  const writes = { enabled: true };
  const ctx = createPayPalContext({
    db: t.db,
    config: { environment: 'sandbox', clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, baseUrl: oauth.baseUrl, webhookId: undefined },
    clock,
    restBaseUrl: pp.baseUrl,
    deps: { writesEnabled: () => writes.enabled, sleep: async (ms) => void sleeps.push(ms), random: () => 0.5 },
    sdkOverrides: { adapter: sdkAdapter(pp) },
  });
  return {
    t,
    oauth,
    pp,
    ctx,
    clock,
    sleeps,
    writes,
    async close() {
      await pp.close();
      await oauth.close();
      await t.drop();
    },
  };
}

export interface SeedOptions {
  unit?: bigint;
  quantity?: number;
  shipping?: bigint;
  tax?: bigint;
  title?: string;
  deliverBy?: string;
  mandateStatus?: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  gatePass?: boolean | null;
  decisionSha256?: string;
  state?: 'GATED' | 'AWAITING_APPROVAL';
  /** override the amount stored on the order (to provoke AMOUNT_MISMATCH) */
  amountMinor?: bigint;
}

export interface SeededOrder {
  orderId: string;
  proposalId: string;
  mandateSha: string;
  decisionSha: string;
  total: bigint;
}

/** A mandate → gated proposal → AWAITING_APPROVAL order, as the API leaves it just before the human approves. */
export async function seedGatedOrder(t: TestDb, o: SeedOptions = {}): Promise<SeededOrder> {
  const unit = o.unit ?? 1250n;
  const quantity = o.quantity ?? 10;
  const shipping = o.shipping ?? 500n;
  const tax = o.tax ?? 1040n;
  const total = unit * BigInt(quantity) + shipping + tax;
  const mandateId = uuidv7();
  const proposalId = uuidv7();
  const orderId = uuidv7();
  const mandateSha = randomBytes(32).toString('hex');
  const decisionSha = o.decisionSha256 ?? randomBytes(32).toString('hex');
  await t.db.query(
    `insert into mandate (id, version, status, spec, quantity, unit_ceiling_minor, budget_minor, currency,
       deliver_by, approval_threshold_minor, expires_at, sha256, created_by)
     values ($1, 1, $2, '{"keywords":["cable"]}', $3, 18000, 200000, 'USD', $4, 100000, '2036-12-31T00:00:00Z', $5, 'test')`,
    [mandateId, o.mandateStatus ?? 'ACTIVE', quantity, o.deliverBy ?? '2036-11-25', mandateSha],
  );
  await t.db.query(
    `insert into proposal (id, mandate_id, mandate_version, product_id, domain, title, unit_price_minor, quantity,
       shipping_minor, tax_minor, eta, gate_pass, decision_sha256)
     values ($1, $2, 1, 'sku-1', 'example.com', $3, $4, $5, $6, $7, '2036-11-20', $8, $9)`,
    [proposalId, mandateId, o.title ?? 'USB-C cable 2m', unit, quantity, shipping, tax, o.gatePass === undefined ? true : o.gatePass, decisionSha],
  );
  const state = o.state ?? 'AWAITING_APPROVAL';
  // GATED is the initial state; AWAITING_APPROVAL is reached through the real guarded transition.
  await withTx(async (tx) => {
    await insertOrder(tx, { id: orderId, proposalId, state: 'GATED', amountMinor: o.amountMinor ?? total });
    if (state === 'AWAITING_APPROVAL') await transition(tx, orderId, ['GATED'], 'AWAITING_APPROVAL');
  }, t.db);
  return { orderId, proposalId, mandateSha, decisionSha, total };
}

/** Insert a fulfillment row (the simulated carrier record) for an order. */
export async function seedFulfillment(
  t: TestDb,
  orderId: string,
  f: { carrier?: string; trackingNumber?: string; deliveredAt?: Date | null } = {},
): Promise<void> {
  await t.db.query(
    `insert into fulfillment (order_id, carrier, tracking_number, shipped_at, delivered_at, source)
     values ($1, $2, $3, now(), $4, 'SIMULATED')`,
    [orderId, f.carrier ?? 'UPS', f.trackingNumber ?? '1Z999AA10123456784', f.deliveredAt === undefined ? new Date() : f.deliveredAt],
  );
}
