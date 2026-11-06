#!/usr/bin/env node
/**
 * Register AegisPay's webhook listener with the PayPal sandbox app (idempotent), and record PAYPAL_WEBHOOK_ID in the
 * gitignored .env so the Render script can push it to the service.
 *
 *   node scripts/paypal-webhook.mjs https://<your-service>.onrender.com
 *
 * Prints the webhook id and URL only; never a secret.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const base = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '');
if (!base.includes('sandbox')) throw new Error('refusing to register a webhook outside the PayPal sandbox');
const appUrl = process.argv[2]?.replace(/\/$/, '');
if (!appUrl?.startsWith('https://')) throw new Error('usage: node scripts/paypal-webhook.mjs https://<public-host>');
const url = `${appUrl}/webhooks/paypal`;

// The events packages/payments/src/webhooks/process.ts acts on.
const EVENTS = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.AUTHORIZATION.CREATED',
  'PAYMENT.AUTHORIZATION.VOIDED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'CUSTOMER.DISPUTE.CREATED',
  'CUSTOMER.DISPUTE.UPDATED',
  'CUSTOMER.DISPUTE.RESOLVED',
];

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set (.env)');

const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
  method: 'POST',
  headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
});
if (!tokenRes.ok) throw new Error(`PayPal token -> ${tokenRes.status}`);
const token = (await tokenRes.json()).access_token;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const list = await fetch(`${base}/v1/notifications/webhooks`, { headers });
if (!list.ok) throw new Error(`PayPal list webhooks -> ${list.status}: ${(await list.text()).slice(0, 300)}`);
let hook = ((await list.json()).webhooks ?? []).find((w) => w.url === url);

if (!hook) {
  const res = await fetch(`${base}/v1/notifications/webhooks`, { method: 'POST', headers, body: JSON.stringify({ url, event_types: EVENTS.map((name) => ({ name })) }) });
  if (!res.ok) throw new Error(`PayPal create webhook -> ${res.status}: ${(await res.text()).slice(0, 400)}`);
  hook = await res.json();
  console.log('created');
} else console.log('exists');

const envText = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
if (!/^PAYPAL_WEBHOOK_ID=/m.test(envText)) appendFileSync('.env', `${envText.endsWith('\n') || envText === '' ? '' : '\n'}PAYPAL_WEBHOOK_ID=${hook.id}\n`);
console.log(JSON.stringify({ webhookId: hook.id, url }, null, 2));
