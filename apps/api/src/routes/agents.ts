import { buildQuery, parseMandateText, searchCatalog, shortlist } from '@aegis/agents';
import { DomainError, ParseMandateBody } from '@aegis/core';
import {
  appendAudit,
  uuidv7,
  getCurrentMandate,
  getSupplierProfile,
  insertCatalogSnapshot,
  insertProposal,
  lockMandate,
  spentSoFar,
  toGateMandate,
  withTx,
} from '@aegis/db';
import { evaluate } from '@aegis/gatekeeper';
import type { Proposal } from '@aegis/gatekeeper';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiDeps } from '../deps.ts';

const IdParams = z.object({ id: z.string().uuid() });
const SourceBody = z.object({ limit: z.number().int().min(1).max(30).optional() }).default({});

const DAY_MS = 86_400_000;
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** What the catalog does not tell us, said out loud wherever the proposal is shown. */
const CATALOG_NOTE = 'Shipping and tax are not in the catalog data and are taken as $0.00; the delivery date is the supplier profile\'s simulated lead time.';

/**
 * The agents' two entry points. The agents package only reads (a language model, the Channel3 catalog) and never writes;
 * everything that is persisted is persisted here, and every proposal is judged by the deterministic gatekeeper, not by
 * the model, before it is stored.
 */
export function registerAgentRoutes(app: FastifyInstance, d: ApiDeps): void {
  // Free text -> a mandate DRAFT. Nothing is saved: the owner reviews it and signs it by posting it to POST /api/mandates.
  app.post('/api/mandates/parse', async (req) => {
    const body = ParseMandateBody.parse(req.body);
    if (!d.model) throw new DomainError('AGENT_UNAVAILABLE', 'No language model is configured (set ANTHROPIC_API_KEY or GROQ_API_KEY)');
    const r = await parseMandateText(body.text, { model: d.model, now: d.clock.now() });
    // The run is auditable even though no mandate is saved: what the parser did (its step, the structured draft it produced,
    // a hash of its prompt) is recorded, never the raw text. The live stream shows these to every open tab.
    const runId = uuidv7();
    await withTx(async (tx) => {
      await appendAudit(tx, { actor: 'agent:parser', type: 'AGENT_STEP', entity: 'agent_run', entityId: runId, payload: { ...r.step, requestedBy: req.actor } });
      await appendAudit(tx, { actor: 'agent:parser', type: 'MANDATE_DRAFTED', entity: 'agent_run', entityId: runId, payload: { draft: r.draft, warnings: r.warnings, requestedBy: req.actor } });
    }, d.db);
    return { draft: r.draft, warnings: r.warnings, step: r.step, runId };
  });

  // Search the live catalog for the mandate, shortlist, gate each offer, and store every proposal with its verdict.
  app.post('/api/mandates/:id/source', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = SourceBody.parse(req.body ?? {});
    if (!d.channel3) throw new DomainError('AGENT_UNAVAILABLE', 'No catalog is configured (set CHANNEL3_API_KEY)');

    const current = await getCurrentMandate(d.db, id);
    if (!current) throw new DomainError('NOT_FOUND', `Mandate ${id} not found`);
    if (current.status !== 'ACTIVE') throw new DomainError('MANDATE_NOT_ACTIVE', `Mandate ${id} is ${current.status}; only an active mandate can source`);
    const query = buildQuery(current.spec);
    if (!query) throw new DomainError('MANDATE_INVALID', 'The mandate has no keywords to search for');

    const now = d.clock.now();
    const runId = uuidv7();
    const search = await searchCatalog(d.channel3, { query, maxPriceMinor: current.unitCeilingMinor, ...(body.limit === undefined ? {} : { limit: body.limit }), now });
    const list = await shortlist(search, { spec: current.spec, quantity: current.quantity, unitCeiling: current.unitCeilingMinor }, { model: d.model ?? null });

    const proposals = await withTx(async (tx) => {
      // The mandate may have been amended or paused during the (slow) search: judge against what is true now.
      await lockMandate(tx, id);
      const m = await getCurrentMandate(tx, id);
      if (!m) throw new DomainError('NOT_FOUND', `Mandate ${id} not found`);
      if (m.status !== 'ACTIVE') throw new DomainError('MANDATE_NOT_ACTIVE', `Mandate ${id} is ${m.status}; only an active mandate can source`);
      const spent = await spentSoFar(tx, id);
      const gateMandate = toGateMandate(m);

      // What the sourcing agent did, in order, before any proposal is gated: the stream shows the steps, then the verdicts.
      for (const s of list.steps) {
        await appendAudit(tx, { actor: 'agent:sourcing', type: 'AGENT_STEP', entity: 'agent_run', entityId: runId, payload: { ...s, mandateId: m.id, requestedBy: req.actor } });
      }

      const out = [];
      for (const c of list.candidates) {
        const snap = await insertCatalogSnapshot(tx, { response: c.snapshot, fetchedAt: search.fetchedAt, query: search.requestBody });
        const supplier = await getSupplierProfile(tx, c.domain);
        const etaDate = isoDate(new Date(now.getTime() + supplier.leadTimeMaxDays * DAY_MS));
        const proposal: Proposal = {
          mandateId: m.id,
          mandateVersion: m.version,
          productId: c.productId,
          title: c.title,
          domain: c.domain,
          unitPrice: c.unitPriceMinor,
          currency: 'USD',
          quantity: m.quantity,
          shipping: 0n,
          tax: 0n,
          etaDate,
          ...(c.rating === null ? {} : { rating: c.rating }),
          inStock: c.inStock,
          snapshotSha256: snap.sha256,
        };
        const decision = evaluate(gateMandate, proposal, { now: now.toISOString(), spentSoFar: spent });
        const row = await insertProposal(tx, {
          mandateId: m.id,
          mandateVersion: m.version,
          snapshotId: snap.id,
          productId: c.productId,
          offerUrl: c.offerUrl,
          domain: c.domain,
          title: c.title,
          unitPriceMinor: c.unitPriceMinor,
          quantity: m.quantity,
          shippingMinor: 0n,
          taxMinor: 0n,
          eta: etaDate,
          ...(c.rating === null ? {} : { rating: c.rating }),
          inStock: c.inStock,
          rationale: `${c.rationale} ${CATALOG_NOTE}`,
          gatePass: decision.pass,
          gateResults: decision.results,
          decisionSha256: decision.decisionSha256,
        });
        await appendAudit(tx, {
          actor: 'agent:sourcing',
          type: 'PROPOSAL_GATED',
          entity: 'proposal',
          entityId: row.id,
          payload: {
            mandateId: m.id,
            mandateVersion: m.version,
            productId: c.productId,
            domain: c.domain,
            unitPriceMinor: c.unitPriceMinor,
            totalMinor: decision.total,
            pass: decision.pass,
            failedRules: decision.results.filter((r) => !r.pass).map((r) => r.id),
            decisionSha256: decision.decisionSha256,
            snapshotSha256: snap.sha256,
            requestedBy: req.actor,
          },
        });
        out.push(row);
      }
      return out;
    }, d.db);

    return reply.code(201).send({
      runId,
      query,
      proposals,
      steps: list.steps,
      skipped: search.skipped,
      passed: proposals.filter((p) => p.gatePass).length,
    });
  });
}
