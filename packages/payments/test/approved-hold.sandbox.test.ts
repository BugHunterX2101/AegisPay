import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { getOrder, recordDelivery, recordShipment, verifyChain, withTx } from '@aegis/db';
import { freshDb } from '@aegis/db/testing';
import type { TestDb } from '@aegis/db/testing';
import { createPayPalContext } from '../src/client.ts';
import type { PayPalContext } from '../src/client.ts';
import { SANDBOX_BASE_URL, loadPayPalConfig } from '../src/config.ts';
import { HONOR_PERIOD_MS, authorizeHold, createHold } from '../src/orders.ts';
import { capture, getAuthorization, reauthDue, reauthorize, voidHold } from '../src/authorizations.ts';
import { seedGatedOrder } from './harness.ts';

/**
 * LIVE checks of an APPROVED hold against the PayPal SANDBOX (fake money). Opt in with SANDBOX_WRITES=1.
 *
 * A buyer approves in PayPal's own window, and this test does the same in headless Chromium: logged in as the sandbox
 * personal account when PAYPAL_SANDBOX_BUYER_EMAIL / _PASSWORD are in .env, otherwise through that window's "Pay with
 * Credit or Debit Card" guest checkout with a sandbox test card. Guest checkout is PayPal's page, so it works for an
 * India-region merchant; Orders v2 `confirm-payment-source` with a card does not (PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING).
 * Everything after approval (authorize, reauthorize, capture, void) is the app's own code talking to the real sandbox.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const enabled = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.SANDBOX_WRITES === '1';
// A sandbox PERSONAL account (fake money): developer.paypal.com, Testing Tools, Sandbox Accounts.
const buyer =
  process.env.PAYPAL_SANDBOX_BUYER_EMAIL && process.env.PAYPAL_SANDBOX_BUYER_PASSWORD
    ? { email: process.env.PAYPAL_SANDBOX_BUYER_EMAIL, password: process.env.PAYPAL_SANDBOX_BUYER_PASSWORD }
    : null;

// Each hold goes through PayPal's real approval window, which takes 20 to 60 seconds.
describe.skipIf(!enabled)('PayPal sandbox approved hold (live)', { timeout: 180_000 }, () => {
  let t: TestDb;
  let ctx: PayPalContext;

  beforeAll(async () => {
    t = await freshDb();
    const config = loadPayPalConfig({ ...process.env, PAYPAL_BASE_URL: SANDBOX_BASE_URL });
    ctx = createPayPalContext({ db: t.db, config, deps: { writesEnabled: () => true } });
  });
  afterAll(async () => {
    await t?.drop();
  });

  async function orderStatus(paypalOrderId: string): Promise<{ status?: string; links?: Array<{ rel: string; href: string }> }> {
    const tok = await ctx.vault.getToken();
    const r = await fetch(`${SANDBOX_BASE_URL}/v2/checkout/orders/${paypalOrderId}`, { headers: { authorization: `${tok.tokenType} ${tok.accessToken}` } });
    return (await r.json()) as { status?: string; links?: Array<{ rel: string; href: string }> };
  }

  /**
   * The buyer's step as a buyer does it, in PayPal's approval window: logged in as the sandbox personal account when
   * `.env` has one, else as a guest paying with a sandbox test card. Approval is read back from PayPal itself, not
   * from where the browser lands (the return URL is a dummy).
   */
  async function approve(paypalOrderId: string): Promise<void> {
    const link =
      (await orderStatus(paypalOrderId)).links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href ??
      `https://www.sandbox.paypal.com/checkoutnow?token=${paypalOrderId}`;
    // @playwright/test is a root dev dependency (the e2e suite); this package does not declare it.
    const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test') as typeof import('@playwright/test');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(link, { waitUntil: 'domcontentloaded' });
      if (buyer) {
        await page.locator('#email').fill(buyer.email);
        await page.locator('#btnNext').click();
        await page.locator('#password').fill(buyer.password);
        await page.locator('#btnLogin').click();
        // The review page's main button is "Continue to Review Order" / "Complete Purchase" / "Agree & Continue".
        await page.getByRole('button', { name: /continue|complete|agree|pay now/i }).first().click({ timeout: 60_000 });
      } else {
        await payAsGuest(page, paypalOrderId);
      }
      for (let i = 0; i < 30; i++) {
        if ((await orderStatus(paypalOrderId)).status === 'APPROVED') return;
        await new Promise((res) => setTimeout(res, 2_000));
      }
      throw new Error(`PayPal never reported order ${paypalOrderId} APPROVED (page: ${new URL(page.url()).pathname})`);
    } catch (e) {
      // What PayPal's window showed when approval failed, for whoever reads the failure.
      const shot = join(tmpdir(), `aegis-approve-${paypalOrderId}.png`);
      await browser.contexts()[0]?.pages()[0]?.screenshot({ path: shot, fullPage: true }).catch(() => {});
      throw new Error(`${e instanceof Error ? e.message : String(e)} (screenshot: ${shot})`, { cause: e });
    } finally {
      await browser.close();
    }
  }

  /**
   * A fresh Luhn-valid Visa number on 403203, the prefix PayPal's sandbox card generator issues. The sandbox declines
   * the well-known public test numbers: 4111 1111 1111 1111 passes the guest form but `/authorize` answers
   * INSTRUMENT_DECLINED, and 5555 5555 5555 4444 / 4012 8888 8888 1881 are refused by the form ("We weren't able to add
   * this card"). Fresh numbers authorize (checked live 2026-11-08).
   */
  function freshVisa(): string {
    const body = '403203' + Array.from({ length: 9 }, () => String(Math.floor(Math.random() * 10))).join('');
    const sum = [...body]
      .reverse()
      .map((d, i) => (i % 2 === 0 ? ((n) => (n > 9 ? n - 9 : n))(Number(d) * 2) : Number(d)))
      .reduce((a, b) => a + b, 0);
    return body + String((10 - (sum % 10)) % 10);
  }

  /**
   * PayPal's "Pay with Credit or Debit Card" guest form, filled as a US buyer with a fresh sandbox Visa number. Returns
   * once PayPal reports the order APPROVED; a number the form refuses is replaced and the form sent again.
   */
  async function payAsGuest(page: import('@playwright/test').Page, paypalOrderId: string): Promise<void> {
    const card = page.locator('#cardNumber');
    // The window opens on the login form with the guest button under it, or straight on the card form.
    await page.locator('#createAccount').or(card).first().waitFor({ timeout: 30_000 });
    if (!(await card.isVisible())) await page.locator('#createAccount').click();
    await card.waitFor({ timeout: 30_000 });
    await page.locator('#country').selectOption('US');
    await page.locator('#billingState option[value="CA"]').waitFor({ state: 'attached' });
    const refused = page.getByText(/weren.t able to add this card/i);
    for (let submit = 0; submit < 3; submit++) {
      const number = freshVisa();
      // The form re-renders for the country (state list, phone) a moment later and drops what was typed, so fill until
      // the values stay.
      for (let fill = 0; fill < 4; fill++) {
        await page.locator('#email').fill(`guest-${Date.now()}@example.com`);
        await page.locator('#phone').fill('4085551234');
        await card.fill(number);
        await page.locator('#cardExpiry').fill('12/30');
        await page.locator('#cardCvv').fill('123');
        await page.locator('#firstName').fill('Sandbox');
        await page.locator('#lastName').fill('Buyer');
        // A real San Jose street address: PayPal's address check rejects made-up ones like "1 Main St".
        await page.locator('#billingLine1').fill('2211 N 1st St');
        await page.locator('#billingCity').fill('San Jose');
        await page.locator('#billingState').selectOption('CA');
        await page.locator('#billingPostalCode').fill('95131');
        await page.waitForTimeout(2_000);
        if ((await card.inputValue()).replace(/\D/g, '') === number && (await page.locator('#billingPostalCode').inputValue()) === '95131') break;
      }
      expect((await card.inputValue()).replace(/\D/g, '')).toBe(number);
      // PayPal serves two layouts: "Continue as Guest" under "Create Account & Continue", or hidden behind a
      // "Save info & create your PayPal account" switch that is on by default.
      const guest = page.getByRole('button', { name: /continue as guest/i }).or(page.getByRole('link', { name: /continue as guest/i })).first();
      if (!(await guest.isVisible())) {
        // The switch is a visually hidden <input role="switch"> under a styled track, so a pointer click cannot land on
        // it; the element's own click() fires the change PayPal's page listens for.
        const save = page.locator('[data-testid="onboard-options-switch"]').or(page.getByRole('switch', { name: /save info/i })).first();
        await save.evaluate((el) => (el as unknown as { click(): void }).click());
        await guest.waitFor({ timeout: 10_000 });
      }
      await guest.click();
      // PayPal sometimes opens an address modal with a Continue button: "We can't verify your address" or "We've
      // found a match for your address" (standardized suggestion preselected). The order stays unapproved until
      // that is accepted.
      const unverified = page.getByText(/can.t verify your address|found a match for your address/i);
      for (let i = 0; i < 20; i++) {
        if ((await orderStatus(paypalOrderId)).status === 'APPROVED') return;
        if (await refused.isVisible()) break;
        if (await unverified.isVisible()) {
          await page.getByRole('dialog').getByRole('button', { name: /^continue$/i }).or(page.getByRole('button', { name: /^continue$/i })).first().click();
        }
        await page.waitForTimeout(2_000);
      }
      if (!(await refused.isVisible())) break;
    }
  }

  async function heldOrder() {
    const s = await seedGatedOrder(t);
    const { paypalOrderId } = await createHold(ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'USB-C cables, 10 x 2m' }, appUrl: 'https://aegispay.example' });
    await approve(paypalOrderId);
    const hold = await authorizeHold(ctx, s.orderId, paypalOrderId, { approvedBy: 'owner@acme.test' });
    return { ...s, paypalOrderId, hold };
  }

  let heldId = '';

  it('authorizeHold places a real hold: HELD, with honor and expiry taken from PayPal', async () => {
    const { orderId, hold, total } = await heldOrder();
    heldId = orderId;
    expect(hold.authorizationId).toMatch(/^[A-Z0-9]{10,25}$/);
    const row = (await getOrder(t.db, orderId))!;
    expect(row.state).toBe('HELD');
    expect(row.authorizationHistory).toEqual([hold.authorizationId]);

    const live = await getAuthorization(ctx, orderId, hold.authorizationId);
    expect(live.status).toBe('CREATED');
    expect(live.amount?.value).toBe((Number(total) / 100).toFixed(2));
    expect(row.honorEndsAt!.getTime()).toBe(new Date(live.createTime!).getTime() + HONOR_PERIOD_MS);
    expect(row.authExpiresAt!.toISOString()).toBe(new Date(live.expirationTime!).toISOString());
    // 29 days (PayPal's own expiration_time), give or take a day for time zones in PayPal's answer.
    const days = (row.authExpiresAt!.getTime() - new Date(live.createTime!).getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(31);
  });

  it('inside the honor period the sweep would not reauthorize, and PayPal itself refuses an early reauthorization', async () => {
    expect(heldId, 'the first test placed no hold').not.toBe('');
    const row = (await getOrder(t.db, heldId))!;
    expect(reauthDue(row, new Date())).toBe(false); // honor period runs 3 days from now

    const err = (await reauthorize(ctx, heldId, 2).catch((e: unknown) => e)) as DomainError;
    // Record exactly what PayPal says, so the rule in reauthDue is checked against the real service.
    const answer = err instanceof DomainError ? { code: err.code, message: err.message, details: err.details, paypalName: err.paypalName } : String(err);
    console.log('early reauthorize ->', answer);
    // Vitest hides console output of passing tests, so keep PayPal's answer in a file as well.
    writeFileSync(join(tmpdir(), 'aegis-early-reauthorize.json'), JSON.stringify(answer, null, 2));
    expect(err).toBeInstanceOf(DomainError);
    const after = (await getOrder(t.db, heldId))!;
    expect(after.authorizationHistory).toEqual(row.authorizationHistory); // nothing recorded
    expect(after.state).toBe('HELD');
  });

  it('two concurrent captures after delivery: one PayPal capture, both callers get the same id', async () => {
    expect(heldId, 'the first test placed no hold').not.toBe('');
    await withTx((tx) => recordShipment(tx, heldId, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784', actor: 'test' }), t.db);
    await withTx((tx) => recordDelivery(tx, heldId, { actor: 'test' }), t.db);

    const [a, b] = await Promise.all([capture(ctx, heldId), capture(ctx, heldId)]);
    expect(a.captureId).toBe(b.captureId);
    expect([a.reused, b.reused].sort()).toEqual([false, true]);
    const row = (await getOrder(t.db, heldId))!;
    expect(row.state).toBe('SETTLED');
    expect(row.captureId).toBe(a.captureId);
    expect((await getAuthorization(ctx, heldId, row.authorizationId!)).status).toBe('CAPTURED');
    const { rows } = await t.db.query(`select count(*)::int as n from audit_event where type = 'CAPTURE_BLOCKED' and entity_id = $1`, [heldId]);
    expect(rows[0].n).toBe(0); // the loser waited for the lock instead of failing with ALREADY_CAPTURED
  });

  it('voidHold releases a real hold, and a repeat void changes nothing', async () => {
    const { orderId, hold } = await heldOrder();
    expect(await voidHold(ctx, orderId, { reason: 'CANCEL', confirmedBy: 'owner@acme.test' })).toEqual({ reused: false });
    expect((await getOrder(t.db, orderId))!.state).toBe('VOIDED');
    expect((await getAuthorization(ctx, orderId, hold.authorizationId)).status).toBe('VOIDED');
    expect(await voidHold(ctx, orderId, { reason: 'CANCEL' })).toEqual({ reused: true });
  });

  it('the audit chain is intact after all of that', async () => {
    expect((await verifyChain(t.db)).ok).toBe(true);
  });
});
