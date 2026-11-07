/**
 * Live self-check from the command line: asks a running AegisPay to prove, right now, everything the demo depends on
 * (database, PayPal sandbox token, registered webhook, an Orders v2 AUTHORIZE create, the live Channel3 catalog).
 *
 *   pnpm selfcheck                       # against http://localhost:3000
 *   APP_URL=https://aegispay-w12c.onrender.com pnpm selfcheck
 *
 * Exits 0 when every probe passes, 1 when any fails, 2 when the service cannot be reached.
 */
import { APP_URL, call, printSelfCheck } from './lib/api-client.ts';
import type { SelfCheckBody } from './lib/api-client.ts';

console.log(`self-check ${APP_URL}`);
try {
  const r = await call<SelfCheckBody>(null, 'GET', '/api/selfcheck');
  const ok = printSelfCheck(r);
  console.log(`checked at ${r.checkedAt}: ${ok ? 'all probes passed' : 'at least one probe FAILED'}`);
  process.exitCode = ok ? 0 : 1; // not process.exit(): on Windows it can trip a libuv assertion with fetch sockets still closing
} catch (err) {
  console.error(`unreachable: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
}
