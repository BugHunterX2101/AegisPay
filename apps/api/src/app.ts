import rateLimit from '@fastify/rate-limit';
import { uuidv7 } from '@aegis/db';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from './deps.ts';
import { installErrorHandling } from './errors.ts';
import { toJson } from './json.ts';
import { registerAgentRoutes } from './routes/agents.ts';
import { registerAuditRoutes } from './routes/audit.ts';
import { registerDemoRoutes } from './routes/demo.ts';
import { registerDisputeRoutes } from './routes/disputes.ts';
import { registerMandateRoutes } from './routes/mandates.ts';
import { registerOrderRoutes } from './routes/orders.ts';
import { registerWebhooks } from './routes/webhooks.ts';
import { createSelfCheck } from './selfcheck.ts';
import { installSession } from './session.ts';
import { StreamHub, registerStream } from './stream.ts';

export interface BuildAppOptions {
  deps: ApiDeps;
  /** Signs the session cookie and the CSRF secret. */
  sessionSecret: string;
  /** `Secure` cookies need https; local http (tests, dev) turns this off. */
  secureCookies: boolean;
  judgeMode: boolean;
  paypalClientId: string;
  /** Requests per minute per client for /api routes (the webhook and the stream are exempt). */
  rateLimitMax?: number;
  /** SSE heartbeat comment interval. */
  heartbeatMs?: number;
  logger?: boolean;
}

/**
 * Compose the API. Nothing here reads the environment: `index.ts` does, and tests pass real dependencies in, so the same
 * routes run against real Postgres, a real pg-boss schema and the PayPal contract server.
 */
export async function buildApp(o: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: o.logger ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'] } : false,
    genReqId: () => `req_${uuidv7()}`,
    trustProxy: true,
    forceCloseConnections: true,
    bodyLimit: 64 * 1024,
  });

  app.setReplySerializer((payload) => toJson(payload)); // bigint -> decimal string, everywhere
  installErrorHandling(app);

  await app.register(rateLimit, { global: true, max: o.rateLimitMax ?? 60, timeWindow: '1 minute' });
  await installSession(app, {
    secret: o.sessionSecret,
    secureCookies: o.secureCookies,
    judgeMode: o.judgeMode,
    paypalClientId: o.paypalClientId,
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => {
    await o.deps.db.query('select 1');
    return { ok: true };
  });

  // Live dependency proof. Public (no session) and cheap to call: probes are cached, and the route is rate limited hard.
  const hub = new StreamHub(o.deps.db, (level, event, fields) => app.log[level]({ ...fields, event }));
  const selfCheck = createSelfCheck(o.deps, (r) => hub.publish('selfcheck.result', r));
  app.get('/api/selfcheck', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async () => selfCheck());
  app.get('/selfcheck', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async () => selfCheck());

  registerWebhooks(app, o.deps);
  registerMandateRoutes(app, o.deps);
  registerAgentRoutes(app, o.deps);
  registerOrderRoutes(app, o.deps);
  registerDisputeRoutes(app, o.deps);
  registerAuditRoutes(app, o.deps);
  registerDemoRoutes(app, o.deps, { judgeMode: o.judgeMode });

  registerStream(app, { hub, heartbeatMs: o.heartbeatMs ?? 15_000 });
  app.addHook('onClose', async () => {
    await hub.stop();
  });
  await hub.start();

  return app;
}
