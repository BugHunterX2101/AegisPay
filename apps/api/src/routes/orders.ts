import { DomainError, ShipBody } from '@aegis/core';
import {
  appendAudit,
  cancelUnapprovedOrder,
  createOrderFromProposal,
  getOrder,
  getOrderGridRow,
  getProposalRecord,
  listAuditForEntity,
  listOrderGrid,
  recordDelivery,
  recordShipment,
  withTx,
} from '@aegis/db';
import { authorizeHold, createHold } from '@aegis/payments';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiDeps } from '../deps.ts';
import { humanName } from '../session.ts';

const IdParams = z.object({ id: z.string().uuid() });
const ProposalOrderBody = z.object({ decisionSha256: z.string().regex(/^[0-9a-f]{64}$/) });
/** FR-07: voiding a hold is irreversible, so the caller must say so explicitly. */
const VoidBody = z.object({ reason: z.enum(['SLA_BREACH', 'CANCEL']), confirm: z.literal(true) });

/**
 * Order routes. Every amount PayPal sees comes from DB rows that passed the gate; nothing here accepts a price from the
 * client. State changes and the jobs they call for are committed together (transactional outbox), so a crash cannot
 * leave an order DELIVERED with no capture queued.
 */
export function registerOrderRoutes(app: FastifyInstance, d: ApiDeps): void {
  app.get('/api/orders', async () => ({ orders: await listOrderGrid(d.db) }));

  app.get('/api/orders/:id/audit', async (req) => {
    const { id } = IdParams.parse(req.params);
    return { events: await listAuditForEntity(d.db, id) };
  });

  // Propose -> order -> PayPal authorization-hold order (not yet approved by the buyer).
  app.post('/api/proposals/:id/orders', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = ProposalOrderBody.parse(req.body);
    const proposal = await getProposalRecord(d.db, id);
    if (!proposal) throw new DomainError('NOT_FOUND', `Proposal ${id} not found`);
    if (!proposal.decisionSha256 || proposal.decisionSha256 !== body.decisionSha256) {
      throw new DomainError('DECISION_STALE', 'decision hash does not match the gated proposal');
    }
    const { order, created } = await withTx((tx) => createOrderFromProposal(tx, id, { actor: req.actor, clock: d.clock }), d.db);
    const hold = await createHold(d.ctx, {
      orderRowId: order.id,
      decisionSha256: body.decisionSha256,
      copy: { description: proposal.title ?? 'AegisPay order' },
      appUrl: d.appUrl,
    });
    return reply.code(created ? 201 : 200).send({ orderRowId: order.id, paypalOrderId: hold.paypalOrderId, created, reused: hold.reused });
  });

  // The buyer approved in PayPal's popup; authorize server-side and move the order to HELD.
  app.post('/api/orders/:id/authorize', async (req) => {
    const { id } = IdParams.parse(req.params);
    const order = await getOrder(d.db, id);
    if (!order) throw new DomainError('NOT_FOUND', `Order ${id} not found`);
    if (!order.paypalOrderId) throw new DomainError('BAD_STATE', 'no PayPal order yet: create the hold first');
    const authorization = await authorizeHold(d.ctx, id, order.paypalOrderId, { approvedBy: humanName(req.actor) });
    return { order: await getOrderGridRow(d.db, id), authorization };
  });

  app.post('/api/orders/:id/cancel', async (req) => {
    const { id } = IdParams.parse(req.params);
    const res = await withTx((tx) => cancelUnapprovedOrder(tx, id, { actor: req.actor, reason: 'cancelled before approval' }), d.db);
    return { applied: res.applied, order: await getOrderGridRow(d.db, id) };
  });

  // Fulfillment is simulated and labelled so (fulfillment.source = 'SIMULATED').
  app.post('/api/orders/:id/ship', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = ShipBody.parse(req.body);
    const res = await withTx((tx) => recordShipment(tx, id, { ...body, actor: req.actor, clock: d.clock }), d.db);
    return { applied: res.applied, order: await getOrderGridRow(d.db, id) };
  });

  // Delivery recorded -> capture job queued in the same transaction. The worker still runs the proof gate.
  app.post('/api/orders/:id/deliver', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const res = await withTx(async (tx) => {
      const r = await recordDelivery(tx, id, { actor: req.actor, clock: d.clock });
      const queue = r.order.state === 'DELIVERED';
      if (queue) await d.jobs.capture(id, tx); // singleton per order: a repeat click does not queue a second capture
      return { ...r, queue };
    }, d.db);
    return reply.code(202).send({ applied: res.applied, captureQueued: res.queue, order: await getOrderGridRow(d.db, id) });
  });

  // Human-confirmed void (FR-07). The worker performs the PayPal call; the request itself is audited here.
  app.post('/api/orders/:id/void', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = VoidBody.parse(req.body);
    const queued = await withTx(async (tx) => {
      const order = await getOrder(tx, id, { forUpdate: true });
      if (!order) throw new DomainError('NOT_FOUND', `Order ${id} not found`);
      if (order.state === 'VOIDED') return false;
      if (order.state !== 'HELD' && order.state !== 'IN_TRANSIT') {
        throw new DomainError('BAD_STATE', `Order is ${order.state}; only a HELD or IN_TRANSIT order can be voided`);
      }
      await appendAudit(tx, {
        actor: req.actor,
        type: 'VOID_REQUESTED',
        entity: 'purchase_order',
        entityId: id,
        payload: { reason: body.reason, confirmedBy: req.actor },
      });
      await d.jobs.void(id, { reason: body.reason, confirmedBy: humanName(req.actor) }, tx);
      return true;
    }, d.db);
    return reply.code(queued ? 202 : 200).send({ queued, order: await getOrderGridRow(d.db, id) });
  });
}
