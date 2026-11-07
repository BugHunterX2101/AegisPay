#!/usr/bin/env node
/**
 * Create or update AegisPay on Render through its REST API (Render has no API for Blueprints, so render.yaml documents
 * the same shape and this script performs it). Idempotent: run it again to push changed settings.
 *
 *   node scripts/render-deploy.mjs
 *
 * Reads RENDER_API_KEY and the app's keys from the gitignored .env (or the process environment). Prints ids and URLs,
 * never a secret. Free plans only: one web service runs the API and the worker together, because a separate background
 * worker is a paid plan. A free web service sleeps after 15 idle minutes, which delays the worker's SLA watch (PayPal
 * retries webhook deliveries, so none are lost).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const API = 'https://api.render.com/v1';
const OWNER_NAME = 'AegisPay'; // the Render team (workspace)
const REGION = 'oregon';
const REPO = 'https://github.com/BugHunterX2101/AegisPay';
const NAMES = { db: 'aegispay-db', web: 'aegispay' };

const key = process.env.RENDER_API_KEY?.trim();
if (!key) throw new Error('RENDER_API_KEY is not set (.env)');

async function render(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Render ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const owner = (await render('GET', '/owners?limit=20')).map((x) => x.owner).find((o) => o.name === OWNER_NAME);
if (!owner) throw new Error(`No Render workspace named ${OWNER_NAME}`);

// 1. Postgres (free).
let db = (await render('GET', `/postgres?ownerId=${owner.id}&name=${NAMES.db}&limit=20`)).map((x) => x.postgres).find((p) => p.name === NAMES.db);
if (!db) {
  db = await render('POST', '/postgres', { name: NAMES.db, ownerId: owner.id, plan: 'free', version: '16', region: REGION, databaseName: 'aegis', databaseUser: 'aegis' });
  console.log(`created postgres ${db.id}`);
} else console.log(`postgres exists ${db.id}`);
for (let i = 0; i < 60; i++) {
  db = await render('GET', `/postgres/${db.id}`);
  if (db.status === 'available') break;
  await new Promise((r) => setTimeout(r, 5000));
}
if (db.status !== 'available') throw new Error(`postgres is ${db.status}, not available yet; run again shortly`);
const databaseUrl = (await render('GET', `/postgres/${db.id}/connection-info`)).internalConnectionString;

// 2. Web service (free): API + worker.
const wanted = {
  NODE_VERSION: '24',
  DATABASE_URL: databaseUrl,
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_BASE_URL: process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com',
  // The hosted demo is sandbox-only, so writes are on there; the local .env flag is a dev safety default and is not copied.
  PAYPAL_WRITES_ENABLED: (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').includes('sandbox') ? 'true' : 'false',
  ...(process.env.PAYPAL_WEBHOOK_ID ? { PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID } : {}),
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  CHANNEL3_API_KEY: process.env.CHANNEL3_API_KEY,
  ...(process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
  // Optional. Vite bakes it into the web bundle at build time (it is a client-side licence key by design), so it must be
  // present as a Render env var when `pnpm build` runs.
  ...(process.env.VITE_AG_GRID_LICENSE_KEY ? { VITE_AG_GRID_LICENSE_KEY: process.env.VITE_AG_GRID_LICENSE_KEY } : {}),
  JUDGE_MODE: 'true',
};
for (const [k, v] of Object.entries(wanted)) if (!v) throw new Error(`${k} is not set (.env)`);

// `pnpm build` writes the web app into apps/api/public, which the API serves as same-origin static files.
const buildCommand = 'corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build';
const startCommand = 'pnpm --filter @aegis/worker start & pnpm --filter @aegis/api start & wait -n';

let svc = (await render('GET', `/services?ownerId=${owner.id}&name=${NAMES.web}&limit=20`)).map((x) => x.service).find((s) => s.name === NAMES.web);
if (!svc) {
  const created = await render('POST', '/services', {
    type: 'web_service',
    name: NAMES.web,
    ownerId: owner.id,
    repo: REPO,
    branch: 'main',
    autoDeploy: 'yes',
    envVars: [...Object.entries(wanted).map(([k, v]) => ({ key: k, value: v })), { key: 'SESSION_SECRET', value: randomBytes(48).toString('base64url') }],
    serviceDetails: {
      runtime: 'node',
      plan: 'free',
      region: REGION,
      healthCheckPath: '/healthz',
      envSpecificDetails: { buildCommand, startCommand },
    },
  });
  svc = created.service;
  console.log(`created web service ${svc.id}`);
} else {
  console.log(`web service exists ${svc.id}; updating settings`);
  for (const [k, v] of Object.entries(wanted)) await render('PUT', `/services/${svc.id}/env-vars/${k}`, { value: v });
  await render('PATCH', `/services/${svc.id}`, { serviceDetails: { healthCheckPath: '/healthz', envSpecificDetails: { buildCommand, startCommand } } });
}

// APP_URL is the public URL, which Render assigns at creation: set it now, then redeploy so PayPal return URLs are right.
const url = (await render('GET', `/services/${svc.id}`)).serviceDetails.url;
await render('PUT', `/services/${svc.id}/env-vars/APP_URL`, { value: url });
const deploy = await render('POST', `/services/${svc.id}/deploys`, {});
// Render may answer 201/202 with no body when a deploy is already queued (service creation starts one), so deploy can be null.
console.log(JSON.stringify({ serviceId: svc.id, url, webhookUrl: `${url}/webhooks/paypal`, deployId: deploy?.id ?? null }, null, 2));
