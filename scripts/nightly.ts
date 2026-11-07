/**
 * The nightly health run against a live AegisPay, for a scheduler (CI cron, Render cron):
 *   1. live self-check: database, PayPal sandbox token, webhook, Orders v2, Channel3
 *   2. audit chain verification: recomputes every hash and prev-hash link
 *   3. dispute sync: asks PayPal for the current state of every dispute that is still open
 *
 *   APP_URL=https://aegispay-w12c.onrender.com pnpm nightly
 *
 * Exits 0 when everything is healthy, 1 when any step reports a problem, 2 when the service cannot be reached.
 */
import { APP_URL, call, openSession, printSelfCheck } from './lib/api-client.ts';
import type { SelfCheckBody } from './lib/api-client.ts';

interface Verify {
  ok: boolean;
  count?: string;
  firstBadSeq?: string;
  reason?: string;
}
interface Dispute {
  paypalDisputeId: string;
  status: string | null;
}

/** PayPal's terminal dispute status; everything else (OPEN, WAITING_FOR_*, UNDER_REVIEW, OTHER) can still change. */
const CLOSED = new Set(['RESOLVED']);

console.log(`nightly run ${new Date().toISOString()} against ${APP_URL}`);
let problems = 0;
try {
  const s = await openSession();

  console.log('\n1. live self-check');
  if (!printSelfCheck(await call<SelfCheckBody>(null, 'GET', '/api/selfcheck'))) problems++;

  console.log('\n2. audit chain');
  const v = await call<Verify>(s, 'GET', '/api/audit/verify');
  if (v.ok) console.log(`  PASS  chain verifies${v.count !== undefined ? ` (${v.count} rows)` : ''}`);
  else {
    console.log(`  FAIL  first bad row ${v.firstBadSeq}: ${v.reason}`);
    problems++;
  }

  console.log('\n3. open disputes');
  const { disputes } = await call<{ disputes: Dispute[] }>(s, 'GET', '/api/disputes');
  const open = disputes.filter((d) => !CLOSED.has(d.status ?? ''));
  if (open.length === 0) console.log(`  none open (${disputes.length} total)`);
  for (const d of open) {
    try {
      await call(s, 'POST', `/api/disputes/${encodeURIComponent(d.paypalDisputeId)}/sync`, {});
      console.log(`  PASS  synced ${d.paypalDisputeId} (was ${d.status ?? 'unknown'})`);
    } catch (err) {
      console.log(`  FAIL  ${d.paypalDisputeId}: ${err instanceof Error ? err.message : String(err)}`);
      problems++;
    }
  }
} catch (err) {
  console.error(`unreachable: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
}
if (process.exitCode !== 2) {
  console.log(`\n${problems === 0 ? 'healthy' : `${problems} step(s) reported a problem`}`);
  process.exitCode = problems === 0 ? 0 : 1;
}
