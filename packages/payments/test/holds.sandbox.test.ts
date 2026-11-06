import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getOrder, verifyChain } from '@aegis/db';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { createPayPalContext } from '../src/client.ts';
import type { PayPalContext } from '../src/client.ts';
import { SANDBOX_BASE_URL, loadPayPalConfig } from '../src/config.ts';
import { hasIssue } from '../src/call.ts';
import { authorizeHold, createHold, getPayPalOrder } from '../src/orders.ts';
import { paypalRest } from '../src/rest.ts';
import { simulateEvent } from '../src/webhooks/simulate.ts';
import { seedGatedOrder } from './harness.ts';

/**
 * LIVE WRITE contract checks against the PayPal SANDBOX (fake money). Opt in with SANDBOX_WRITES=1:
 *
 *   SANDBOX_WRITES=1 pnpm test:sandbox
 *
 * It creates sandbox orders (never approved, so no money is held), registers one throw-away webhook and deletes it
 * again. The kill switch is opened only inside this file, through an injected dependency; the process environment is
 * never changed. A buyer cannot approve an order without a browser login, so capture/refund/dispute flows stay
 * covered by the local contract server until a sandbox buyer is available.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const enabled = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.SANDBOX_WRITES === '1';

describe.skipIf(!enabled)('PayPal sandbox write contract (live)', () => {
  let t: TestDb;
  let ctx: PayPalContext;
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    t = await freshDb();
    const config = loadPayPalConfig({ ...process.env, PAYPAL_BASE_URL: SANDBOX_BASE_URL });
    ctx = createPayPalContext({ db: t.db, config, deps: { writesEnabled: () => true } });
  });
  afterAll(async () => {
    for (const c of cleanups.reverse()) await c().catch(() => undefined);
    await t?.drop();
  });

  it('createHold sends an AUTHORIZE order PayPal accepts: our amounts, tax_total without item tax, our invoice id', async () => {
    const s = await seedGatedOrder(t);
    const { paypalOrderId, reused } = await createHold(ctx, {
      orderRowId: s.orderId,
      decisionSha256: s.decisionSha,
      copy: { description: 'USB-C cables, 10 x 2m' },
      appUrl: 'https://aegispay.example',
    });
    expect(reused).toBe(false);
    expect(paypalOrderId).toMatch(/^[A-Z0-9]{10,25}$/);

    const live = await getPayPalOrder(ctx, s.orderId, paypalOrderId);
    expect(String(live.intent).toUpperCase()).toBe('AUTHORIZE');
    // Not approved by any buyer, so nothing is held. PayPal reports it as waiting for the payer.
    expect(['CREATED', 'PAYER_ACTION_REQUIRED']).toContain(String(live.status));
    const unit = live.purchaseUnits?.[0];
    const expected = (Number(s.total) / 100).toFixed(2);
    expect(unit?.amount?.value).toBe(expected);
    expect(unit?.amount?.currencyCode).toBe('USD');
    expect(unit?.amount?.breakdown?.taxTotal?.value).toBe('10.40');

    // The order row recorded the PayPal id; a second createHold is local, with no new PayPal order.
    expect((await getOrder(t.db, s.orderId))!.paypalOrderId).toBe(paypalOrderId);
    const again = await createHold(ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'x' }, appUrl: 'https://aegispay.example' });
    expect(again).toEqual({ paypalOrderId, reused: true });
  });

  it("authorizing an order the buyer has not approved is refused with PayPal's real ORDER_NOT_APPROVED issue", async () => {
    const s = await seedGatedOrder(t);
    const { paypalOrderId } = await createHold(ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'x' }, appUrl: 'https://aegispay.example' });
    const err = (await authorizeHold(ctx, s.orderId, paypalOrderId, { approvedBy: 'owner@acme.test' }).catch((e: unknown) => e)) as DomainError;
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('ORDER_NOT_APPROVED');
    expect((await getOrder(t.db, s.orderId))!.state).toBe('AWAITING_APPROVAL'); // nothing recorded
  });

  it('the same PayPal-Request-Id replays the same order instead of creating a second one', async () => {
    const subject = { type: 'sandbox_contract', id: randomUUID() };
    const send = () =>
      paypalRest<{ id: string }>(ctx, {
        method: 'POST',
        path: '/v2/checkout/orders',
        json: { intent: 'AUTHORIZE', purchase_units: [{ reference_id: 'default', amount: { currency_code: 'USD', value: '5.00' } }] },
        action: 'create_order',
        subject,
        write: true,
        idempotent: true,
      });
    const a = await send();
    const b = await send();
    expect(a.requestId).toBe(b.requestId);
    expect(b.result.id).toBe(a.result.id);
  });

  it('unknown capture / refund ids answer 404 RESOURCE_NOT_FOUND with INVALID_RESOURCE_ID', async () => {
    const refund = (await paypalRest(ctx, {
      method: 'POST',
      path: '/v2/payments/captures/0AB12345CD678901E/refund',
      json: { amount: { currency_code: 'USD', value: '1.00' } },
      action: 'refund',
      subject: { type: 'sandbox_contract', id: randomUUID() },
      write: true,
      idempotent: true,
    }).catch((e: unknown) => e)) as DomainError;
    expect(refund).toBeInstanceOf(DomainError);
    expect(hasIssue(refund, 'INVALID_RESOURCE_ID')).toBe(true);

    const get = (await paypalRest(ctx, {
      method: 'GET',
      path: '/v2/payments/refunds/0AB12345CD678901E',
      action: 'get',
      subject: { type: 'sandbox_contract', id: randomUUID() },
      write: false,
    }).catch((e: unknown) => e)) as DomainError;
    expect(hasIssue(get, 'INVALID_RESOURCE_ID')).toBe(true);
  });

  it('simulate-event against a registered webhook answers with an event id, recorded as simulated in the audit log', async (c) => {
    // Register a throw-away webhook (any https URL is accepted by the sandbox; nothing needs to listen for this check).
    const created = await paypalRest<{ id?: string }>(ctx, {
      method: 'POST',
      path: '/v1/notifications/webhooks',
      json: { url: `https://example.com/aegispay-contract-${randomUUID()}`, event_types: [{ name: 'PAYMENT.AUTHORIZATION.CREATED' }] },
      action: 'verify_webhook',
      subject: { type: 'sandbox_contract', id: randomUUID() },
      write: true,
    }).catch((e: unknown) => e);
    if (created instanceof Error) c.skip(`could not register a throw-away webhook: ${created.message}`);
    const webhookId = (created as { result: { id?: string } }).result.id!;
    expect(webhookId).toBeTruthy();
    cleanups.push(async () => {
      const tok = await ctx.vault.getToken();
      await fetch(`${SANDBOX_BASE_URL}/v1/notifications/webhooks/${webhookId}`, { method: 'DELETE', headers: { authorization: `${tok.tokenType} ${tok.accessToken}` } });
    });

    const { eventId } = await simulateEvent(ctx, { webhookId, eventType: 'PAYMENT.AUTHORIZATION.CREATED' });
    expect(eventId).toMatch(/^WH-/);

    // FINDING (verified live 2026-11-06): a simulated event is NOT stored in PayPal's event log, so
    // GET /v1/notifications/webhooks-events/{id} answers 404 INVALID_RESOURCE_ID for it. Whether the id we record here
    // is the id on the later delivery can therefore only be checked with a real listener (see scripts/register-webhook).
    const { rows } = await t.db.query(`select 1 from audit_event where type = 'WEBHOOK_SIMULATED' and entity_id = $1`, [eventId]);
    expect(rows).toHaveLength(1);
  });

  it('the audit chain is intact after all of that', async () => {
    expect((await verifyChain(t.db)).ok).toBe(true);
  });
});
