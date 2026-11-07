/**
 * Seed a running AegisPay with REAL data, through the same API the browser uses: for each search, a signed mandate, a
 * live Channel3 catalog search, the gatekeeper's verdicts, and a PayPal sandbox AUTHORIZE order left awaiting buyer
 * approval. Nothing is inserted into the database directly and nothing is made up.
 *
 *   pnpm seed                          # 3 orders against http://localhost:3000
 *   pnpm seed --reset                  # first clear the demo tables (Judge Mode only; the audit chain is kept)
 *   pnpm seed --count 5
 *   APP_URL=https://aegispay-w12c.onrender.com pnpm seed
 *
 * Each order is a free PayPal sandbox hold; nothing moves until a buyer approves it in the sandbox.
 */
import { APP_URL, call, openSession } from './lib/api-client.ts';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const countArg = args.indexOf('--count');
const count = countArg >= 0 ? Number(args[countArg + 1]) : 3;
if (!Number.isInteger(count) || count < 1 || count > 10) {
  console.error('--count must be a whole number from 1 to 10');
  process.exit(2);
}

const SEARCHES = [
  { keywords: ['usb-c cable'], ceiling: '1500' },
  { keywords: ['steel water bottle'], ceiling: '2500' },
  { keywords: ['desk lamp'], ceiling: '3000' },
  { keywords: ['wireless mouse'], ceiling: '3000' },
  { keywords: ['notebook'], ceiling: '1500' },
];

interface Proposal {
  id: string;
  title: string;
  domain: string;
  gatePass: boolean;
  decisionSha256: string;
  unitPriceMinor: string;
}

console.log(`seeding ${APP_URL}`);
const s = await openSession();
if (reset) {
  await call(s, 'POST', '/api/demo/reset', {});
  console.log('demo tables cleared (the audit chain was kept)');
}

const deliverBy = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
let made = 0;
for (let i = 0; made < count && i < SEARCHES.length; i++) {
  const q = SEARCHES[i]!;
  const label = q.keywords.join(' ');
  try {
    const { mandate } = await call<{ mandate: { id: string } }>(s, 'POST', '/api/mandates', {
      draft: { spec: { keywords: q.keywords }, quantity: 1, unitCeiling: q.ceiling, budget: q.ceiling, currency: 'USD', deliverBy },
      sourceText: `Buy one ${label} for at most ${q.ceiling} minor units, delivered by ${deliverBy}.`,
    });
    const sourced = await call<{ proposals: Proposal[]; passed: number }>(s, 'POST', `/api/mandates/${mandate.id}/source`, {});
    const pick = sourced.proposals.find((p) => p.gatePass);
    if (!pick) {
      console.log(`  ${label}: ${sourced.proposals.length} offers, none passed the gate; skipped`);
      continue;
    }
    const order = await call<{ orderRowId: string; paypalOrderId: string }>(s, 'POST', `/api/proposals/${pick.id}/orders`, { decisionSha256: pick.decisionSha256 });
    made++;
    console.log(`  ${label}: ${pick.title} @ ${pick.domain}, unit ${pick.unitPriceMinor} minor -> PayPal hold ${order.paypalOrderId} awaiting approval`);
  } catch (err) {
    console.log(`  ${label}: failed (${err instanceof Error ? err.message : String(err)})`);
  }
}
console.log(`${made} of ${count} order(s) created. The grid shows them live; approve each in the PayPal sandbox to continue.`);
process.exitCode = made > 0 ? 0 : 1;
