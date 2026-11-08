import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { uuidv7 } from '@aegis/db';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  paypalEnv?: 'sandbox';
  /** Requests per minute per client for /api routes (the webhook and the stream are exempt). */
  rateLimitMax?: number;
  /** SSE heartbeat comment interval. */
  heartbeatMs?: number;
  logger?: boolean;
  /**
   * Directory holding the built web app (`pnpm build` writes apps/api/public). Absent, or a directory without an
   * index.html, means API only: `index.ts` passes the real one, tests opt in explicitly.
   */
  webRoot?: string | null;
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

  // The web app is same-origin static files. It is registered BEFORE the rate limiter on purpose: the limiter only wraps
  // routes added after it, so loading the page never spends a visitor's /api budget. Unknown paths still reach the
  // JSON 404 above (the app is a single page, so there are no client-side routes to fall back for).
  const webRoot = o.webRoot ?? null;
  if (webRoot && existsSync(join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webRoot,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        // Vite fingerprints everything under /assets, so it can be cached for good; the page itself must always be fresh.
        void res.header('cache-control', filePath.includes(`${join(webRoot, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  await app.register(rateLimit, { global: true, max: o.rateLimitMax ?? 60, timeWindow: '1 minute' });
  await installSession(app, {
    secret: o.sessionSecret,
    secureCookies: o.secureCookies,
    judgeMode: o.judgeMode,
    paypalClientId: o.paypalClientId,
    ...(o.paypalEnv ? { paypalEnv: o.paypalEnv } : {}),
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => {
    await o.deps.db.query('select 1');
    return { ok: true };
  });

  // Where PayPal sends the buyer after a redirect-style approval (the order's return_url / cancel_url). The popup flow in
  // the web app never lands here; a buyer who approves on paypal.com does. Send them back to the command center.
  app.get('/approved', { config: { rateLimit: false } }, async (_req, reply) => reply.redirect('/?paypal=approved', 302));
  app.get('/cancelled', { config: { rateLimit: false } }, async (_req, reply) => reply.redirect('/?paypal=cancelled', 302));

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
