#!/usr/bin/env node
/**
 * Drive one real PayPal-sandbox order through a running AegisPay (the Render deploy by default), end to end.
 *
 *   node scripts/demo-order.mjs start    # mandate -> live catalog search -> gated proposal -> PayPal hold; prints ONE approval link
 *   node scripts/demo-order.mjs finish   # after you approved the link: authorize -> ship -> deliver -> wait for capture
 *   node scripts/demo-order.mjs status   # show the order row
 *
 * APP_URL (env) overrides the target. Session cookie, CSRF token and ids are kept in the OS temp dir, never in the repo.
 * The sandbox approval is the only step that needs a human: PayPal requires a buyer to log in in a browser.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = (process.env.APP_URL || 'https://aegispay-w12c.onrender.com').replace(/\/$/, '');
const STATE = join(tmpdir(), 'aegispay-demo-state.json');
const stage = process.argv[2] ?? 'start';

const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

async function session() {
  const res = await fetch(`${APP}/api/session`);
  if (!res.ok) throw new Error(`GET /api/session -> ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const { csrfToken, actor } = await res.json();
  return { cookie, csrfToken, actor };
}

async function api(s, method, path, body) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: { cookie: s.cookie, 'x-csrf-token': s.csrfToken, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ''}: ${json?.error?.message ?? text.slice(0, 200)}`);
  return json;
}

if (stage === 'start') {
  const s = await session();
  const deliverBy = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const keywords = (process.env.DEMO_KEYWORDS || 'usb-c cable').split(',').map((k) => k.trim());
  const ceiling = process.env.DEMO_UNIT_CEILING_MINOR || '1500';
  const { mandate } = await api(s, 'POST', '/api/mandates', {
    draft: { spec: { keywords }, quantity: 1, unitCeiling: ceiling, budget: ceiling, currency: 'USD', deliverBy },
    sourceText: `Buy one ${keywords.join(' ')} for at most ${ceiling} minor units, delivered by ${deliverBy}.`,
  });
  console.log(`mandate ${mandate.id}`);

  const sourced = await api(s, 'POST', `/api/mandates/${mandate.id}/source`, {});
  console.log(`catalog query "${sourced.query}": ${sourced.proposals.length} proposals, ${sourced.passed} passed the gate`);
  const pick = sourced.proposals.find((p) => p.gatePass);
  if (!pick) throw new Error('no proposal passed the gatekeeper; try DEMO_KEYWORDS or a higher DEMO_UNIT_CEILING_MINOR');
  console.log(`chosen: ${pick.title} @ ${pick.domain}, unit ${pick.unitPriceMinor} minor`);

  const order = await api(s, 'POST', `/api/proposals/${pick.id}/orders`, { decisionSha256: pick.decisionSha256 });
  save({ ...s, mandateId: mandate.id, proposalId: pick.id, orderRowId: order.orderRowId, paypalOrderId: order.paypalOrderId });
  console.log('\nApprove this PayPal SANDBOX order once (log in with a sandbox buyer account), then run: node scripts/demo-order.mjs finish');
  console.log(`https://www.sandbox.paypal.com/checkoutnow?token=${order.paypalOrderId}`);
} else if (stage === 'finish') {
  const st = load();
  if (!st.orderRowId) throw new Error('no order in progress: run "start" first');
  await api(st, 'POST', `/api/orders/${st.orderRowId}/authorize`);
  console.log('authorized -> HELD');
  await api(st, 'POST', `/api/orders/${st.orderRowId}/ship`, { carrier: 'FEDEX', trackingNumber: `AEGIS${Date.now().toString().slice(-9)}` });
  console.log('shipment recorded (simulated fulfillment)');
  await api(st, 'POST', `/api/orders/${st.orderRowId}/deliver`);
  console.log('delivery recorded, capture queued; waiting for the worker');
  for (let i = 0; i < 40; i++) {
    const row = (await api(st, 'GET', '/api/orders')).orders.find((o) => o.id === st.orderRowId);
    console.log(`  state ${row?.state}`);
    if (row && ['CAPTURED', 'CAPTURE_FAILED', 'VOIDED'].includes(row.state)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
} else if (stage === 'status') {
  const st = load();
  const row = (await api(st, 'GET', '/api/orders')).orders.find((o) => o.id === st.orderRowId);
  console.log(JSON.stringify(row, null, 2));
} else throw new Error(`unknown stage ${stage}`);
