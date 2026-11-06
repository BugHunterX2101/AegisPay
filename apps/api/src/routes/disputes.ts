import { draftEvidenceNotes } from '@aegis/agents';
import type { DefenseInput } from '@aegis/agents';
import { DisputeSubmitBody, DomainError } from '@aegis/core';
import {
  getDispute,
  getDisputeSources,
  getEvidenceBundle,
  getFulfillment,
  getOrder,
  latestEvidenceBundle,
  listAuditForEntity,
  listDisputes,
  listRefunds,
} from '@aegis/db';
import type { EvidenceBundleRow } from '@aegis/db';
import { buildEvidenceBundle, reviewEvidenceBundle, submitEvidence, syncDispute } from '@aegis/payments';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiDeps } from '../deps.ts';

const DisputeParams = z.object({ id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });
const FileParams = z.object({ bundleId: z.string().uuid(), name: z.string().regex(/^[a-z0-9-]+\.pdf$/) });

/** What a person needs to review a bundle: the notes, the hashes and the file list. The bytes are fetched one file at a time. */
function bundleView(b: EvidenceBundleRow) {
  const evidences = (b.inputJson as { evidences?: Array<{ notes?: string }> } | null)?.evidences;
  return {
    id: b.id,
    disputeId: b.disputeId,
    sha256: b.sha256,
    notes: evidences?.[0]?.notes ?? null,
    plan: b.plan,
    files: b.files.map((f) => ({ name: f.name, mime: f.mime, sha256: f.sha256, bytes: Buffer.byteLength(f.bytes_base64, 'base64') })),
    reviewedBy: b.reviewedBy,
    submittedAt: b.submittedAt,
  };
}

/** `user:<sid>` -> `<sid>`: the review and submit functions add the prefix themselves when they write the audit row. */
const humanName = (actor: string): string => actor.replace(/^user:/, '');

/**
 * Dispute routes. PayPal is the source of truth for a dispute; these routes pull it, answer from our own records, and
 * send nothing until a named human has attested to the exact bundle (by hash) they were shown.
 */
export function registerDisputeRoutes(app: FastifyInstance, d: ApiDeps): void {
  app.get('/api/disputes', async () => ({ disputes: await listDisputes(d.db) }));

  app.get('/api/disputes/:id', async (req) => {
    const { id } = DisputeParams.parse(req.params);
    const dispute = await getDispute(d.db, id);
    if (!dispute) throw new DomainError('NOT_FOUND', `Dispute ${id} is not synced yet`);
    const bundle = await latestEvidenceBundle(d.db, id);
    return { dispute, bundle: bundle ? bundleView(bundle) : null, events: await listAuditForEntity(d.db, id) };
  });

  // Pull the dispute from PayPal and bring our dispute row and the order's state in line with it. Safe to repeat.
  app.post('/api/disputes/:id/sync', async (req) => {
    const { id } = DisputeParams.parse(req.params);
    const s = await syncDispute(d.ctx, id);
    return { dispute: s.dispute, orderId: s.orderId, orderState: s.orderState, changed: s.changed, moved: s.moved };
  });

  // Draft the seller's account from our own records, render the evidence PDFs, and STORE the bundle. Nothing is sent.
  app.post('/api/disputes/:id/plan', async (req, reply) => {
    const { id } = DisputeParams.parse(req.params);
    const dispute = await getDispute(d.db, id);
    if (!dispute) throw new DomainError('NOT_FOUND', `Dispute ${id} is not synced yet`);
    if (!dispute.orderId) throw new DomainError('BAD_STATE', 'this dispute is not matched to an order of ours');
    const order = await getOrder(d.db, dispute.orderId);
    if (!order) throw new DomainError('NOT_FOUND', `Order ${dispute.orderId} not found`);
    const src = await getDisputeSources(d.db, dispute.orderId);
    const fulfillment = await getFulfillment(d.db, dispute.orderId);
    const refunds = await listRefunds(d.db, dispute.orderId);

    const input: DefenseInput = {
      reason: dispute.reason,
      orderId: order.id,
      amountMinor: order.amountMinor,
      capturedAt: src?.capturedAt ?? null,
      tracking: fulfillment && fulfillment.carrier.trim() && fulfillment.trackingNumber.trim() ? { carrier: fulfillment.carrier, trackingNumber: fulfillment.trackingNumber } : undefined,
      shippedAt: fulfillment?.shippedAt ?? null,
      deliveredAt: fulfillment?.deliveredAt ?? null,
      fulfillmentSource: fulfillment?.source,
      mandateHash: src?.mandateSha256,
      approvedBy: order.approvedBy,
      approvedAt: order.approvedAt,
      productTitle: src?.proposal.title ?? null,
      snapshotSha256: src?.snapshot?.sha256,
      snapshotFetchedAt: src?.snapshot?.fetchedAt ?? null,
      refundIds: refunds.filter((r) => r.status !== 'FAILED' && r.status !== 'CANCELLED').map((r) => r.refundId),
    };
    const notes = await draftEvidenceNotes(input, { model: d.model ?? null });
    const built = await buildEvidenceBundle(d.ctx, id, notes.notes, notes.author);
    if (built.status === 'BLOCKED') return reply.send({ status: 'BLOCKED', missing: built.missing, reason: built.reason });
    return reply.code(201).send({ status: 'BUILT', bundle: bundleView(built.bundle), notesAuthor: notes.author, step: notes.step });
  });

  // The PDFs a human reads before attesting. Served from the stored bytes, the same ones that would be sent.
  app.get('/api/evidence/:bundleId/files/:name', async (req, reply) => {
    const { bundleId, name } = FileParams.parse(req.params);
    const b = await getEvidenceBundle(d.db, bundleId);
    const f = b?.files.find((x) => x.name === name);
    if (!b || !f) throw new DomainError('NOT_FOUND', 'No such evidence file');
    return reply
      .header('content-type', f.mime)
      .header('content-disposition', `inline; filename="${f.name}"`)
      .header('x-content-sha256', f.sha256)
      .send(Buffer.from(f.bytes_base64, 'base64'));
  });

  // Attest to this bundle and send it. The attestation is recorded against the bundle's hash; the payments module then
  // re-checks everything against PayPal's live answer immediately before the call.
  app.post('/api/disputes/:id/submit', async (req) => {
    const { id } = DisputeParams.parse(req.params);
    const body = DisputeSubmitBody.parse(req.body);
    const b = await getEvidenceBundle(d.db, body.bundleId);
    if (!b || b.disputeId !== id) throw new DomainError('NOT_FOUND', `Evidence bundle ${body.bundleId} does not belong to dispute ${id}`);
    const who = humanName(req.actor);
    if (!b.reviewedBy) await reviewEvidenceBundle(d.ctx, body.bundleId, who);
    const r = await submitEvidence(d.ctx, body.bundleId, who);
    return { submitted: true, bundleId: r.bundleId, disputeId: r.disputeId, orderId: r.orderId };
  });
}
