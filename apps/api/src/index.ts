import { channel3FromEnv, modelFromEnv } from '@aegis/agents';
import { OffsetClock, systemClock } from '@aegis/core';
import { closePool, createPool, migrate, watchClockOffset } from '@aegis/db';
import { createJobSender, ensureQueues } from '@aegis/jobs';
import { createPayPalContext, loadPayPalConfig } from '@aegis/payments';
import { PgBoss } from 'pg-boss';
import { buildApp } from './app.ts';

/**
 * API process entry (Render web service). Reads configuration from the environment, brings the schema up to date, and
 * serves HTTP. It only ever queues jobs: the worker process owns queue maintenance and the schedules, so this pg-boss
 * instance is started with both switched off.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters');
  const port = Number(process.env.PORT ?? 3000);
  const appUrl = (process.env.APP_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, '');

  const db = createPool({ connectionString, applicationName: 'aegispay-api' });
  await migrate(db);

  const config = loadPayPalConfig(); // refuses anything but the sandbox, and refuses to start without credentials
  const ctx = createPayPalContext({ db, config, clock: systemClock });

  const boss = new PgBoss({ connectionString, application_name: 'aegispay-api', max: 3, schedule: false, supervise: false });
  boss.on('error', (err: Error) => console.error(JSON.stringify({ level: 'error', event: 'boss.error', message: err.message })));
  await boss.start();
  await ensureQueues(boss);

  // Judge Mode's clock: the app's own "now" (SLA timers) can be moved, PayPal's (ctx stays on systemClock) never is.
  const demoClock = new OffsetClock(0);
  const clockWatch = await watchClockOffset(db, demoClock, {
    onError: (e) => console.error(JSON.stringify({ level: 'warn', event: 'clock.sync_failed', message: e instanceof Error ? e.message : String(e) })),
  });

  const app = await buildApp({
    // Both are null without their key: the agent routes then answer 503 AGENT_UNAVAILABLE instead of inventing results.
    deps: { db, ctx, clock: demoClock, demoClock, jobs: createJobSender(boss), appUrl, model: modelFromEnv(), channel3: channel3FromEnv() },
    sessionSecret,
    secureCookies: appUrl.startsWith('https://'),
    judgeMode: process.env.JUDGE_MODE !== 'false',
    paypalClientId: config.clientId, // public by design: the browser loads the PayPal SDK with it. Never the secret.
    logger: true,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'api stopping');
    try {
      clockWatch.stop();
      await app.close();
      await boss.stop({ graceful: true, timeout: 10_000 });
    } finally {
      await closePool();
      await db.end();
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ level: 'error', event: 'api.crashed', message: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
