import { CreateMandateBody, DomainError } from '@aegis/core';
import {
  amendMandate,
  createMandate,
  getCurrentMandate,
  listMandates,
  listProposalsForMandate,
  setMandateStatus,
  spentSoFar,
  withTx,
} from '@aegis/db';
import type { MandateRecord } from '@aegis/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiDeps } from '../deps.ts';

const IdParams = z.object({ id: z.string().uuid() });
const AmendBody = z.object({ draft: CreateMandateBody.shape.draft });
const StatusBody = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']) });

/** Mandates: the human-signed spending terms. Every change is a new version; an amendment never rewrites history. */
export function registerMandateRoutes(app: FastifyInstance, d: ApiDeps): void {
  const withSpent = async (m: MandateRecord) => ({ ...m, spentMinor: await spentSoFar(d.db, m.id) });

  app.post('/api/mandates', async (req, reply) => {
    const body = CreateMandateBody.parse(req.body);
    const m = await withTx(
      (tx) => createMandate(tx, body.draft, { createdBy: req.actor, clock: d.clock, ...(body.sourceText === undefined ? {} : { sourceText: body.sourceText }) }),
      d.db,
    );
    return reply.code(201).send({ mandate: await withSpent(m) });
  });

  app.get('/api/mandates', async () => {
    const rows = await listMandates(d.db);
    return { mandates: await Promise.all(rows.map(withSpent)) };
  });

  app.get('/api/mandates/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const m = await getCurrentMandate(d.db, id);
    if (!m) throw new DomainError('NOT_FOUND', `Mandate ${id} not found`);
    return { mandate: await withSpent(m), proposals: await listProposalsForMandate(d.db, id) };
  });

  app.post('/api/mandates/:id/amend', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = AmendBody.parse(req.body);
    const m = await withTx((tx) => amendMandate(tx, id, body.draft, { amendedBy: req.actor, clock: d.clock }), d.db);
    return { mandate: await withSpent(m) };
  });

  app.post('/api/mandates/:id/status', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = StatusBody.parse(req.body);
    const m = await withTx((tx) => setMandateStatus(tx, id, body.status, req.actor), d.db);
    return { mandate: await withSpent(m) };
  });
}
