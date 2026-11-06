import { verifyChain } from '@aegis/db';
import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../deps.ts';

/**
 * GET /api/audit/verify recomputes the whole hash chain. It answers 200 even when the chain is broken: the verdict is
 * the payload (`ok: false` plus the first bad row), not an HTTP failure.
 */
export function registerAuditRoutes(app: FastifyInstance, d: ApiDeps): void {
  app.get('/api/audit/verify', async () => verifyChain(d.db));
}
