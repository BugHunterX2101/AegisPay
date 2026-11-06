import { systemClock } from '@aegis/core';
import { closePool, createPool, migrate } from '@aegis/db';
import { CertCache, createPayPalContext, loadPayPalConfig } from '@aegis/payments';
import { createWorker, jsonLog } from './worker.ts';

/**
 * Worker process entry (Render background worker). Reads configuration from the environment, brings the schema up to
 * date, then hands control to pg-boss. It serves no HTTP: the API is the only process exposed to the internet.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const db = createPool({ connectionString, applicationName: 'aegispay-worker' });
  const applied = await migrate(db);
  if (applied.applied.length) jsonLog('info', 'migrations.applied', { files: applied.applied });

  const config = loadPayPalConfig(); // refuses anything but the sandbox, and refuses to start without credentials
  const ctx = createPayPalContext({ db, config, clock: systemClock });
  if (!config.webhookId) {
    jsonLog('warn', 'webhook.unverifiable', { reason: 'PAYPAL_WEBHOOK_ID is not set; stored events stay unverified and untouched' });
  }

  const worker = await createWorker({
    connectionString,
    pipeline: { ctx, certs: new CertCache(systemClock), webhookId: config.webhookId },
    clock: systemClock,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    jsonLog('info', 'worker.stopping', { signal });
    try {
      await worker.stop();
    } finally {
      await closePool();
      await db.end();
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  jsonLog('error', 'worker.crashed', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
