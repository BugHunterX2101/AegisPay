import type { Queryable } from './pool.ts';

/**
 * Everything our own records hold about an order that dispute evidence may be built from.
 * Raw rows only: deciding what to say, and what to refuse to say, is the payments module's job.
 */
export interface DisputeSources {
  orderId: string;
  mandateId: string;
  mandateSha256: string;
  proposal: {
    title: string | null;
    offerUrl: string | null;
    unitPriceMinor: bigint | null;
    /** The gatekeeper's stored per-rule results, as written. Shape is checked by the reader. */
    gateResults: unknown;
  };
  /** The stored catalog response the proposal was gated against, if one was recorded. */
  snapshot: { id: string; sha256: string; fetchedAt: Date; response: unknown } | null;
  /** Timestamp of the CAPTURED audit row for this order: when our ledger recorded the capture. */
  capturedAt: Date | null;
}

interface SourcesDbRow {
  title: string | null;
  offer_url: string | null;
  unit_price_minor: bigint | null;
  gate_results: unknown;
  mandate_id: string;
  mandate_sha256: string;
  snapshot_id: string | null;
  snapshot_sha256: string | null;
  snapshot_fetched_at: Date | null;
  snapshot_response: unknown;
  captured_at: Date | null;
}

export async function getDisputeSources(db: Queryable, orderId: string): Promise<DisputeSources | null> {
  const r = await db.query<SourcesDbRow>(
    `select p.title, p.offer_url, p.unit_price_minor, p.gate_results,
            m.id mandate_id, m.sha256 mandate_sha256,
            s.id snapshot_id, s.sha256 snapshot_sha256, s.fetched_at snapshot_fetched_at, s.response snapshot_response,
            (select a.ts from audit_event a
              where a.type = 'CAPTURED' and a.entity = 'purchase_order' and a.entity_id = o.id::text
              order by a.seq desc limit 1) captured_at
       from purchase_order o
       join proposal p on p.id = o.proposal_id
       join mandate m on m.id = p.mandate_id and m.version = p.mandate_version
       left join catalog_snapshot s on s.id = p.snapshot_id
      where o.id = $1`,
    [orderId],
  );
  const x = r.rows[0];
  if (!x) return null;
  return {
    orderId,
    mandateId: x.mandate_id,
    mandateSha256: x.mandate_sha256.trim(),
    proposal: { title: x.title, offerUrl: x.offer_url, unitPriceMinor: x.unit_price_minor, gateResults: x.gate_results },
    snapshot:
      x.snapshot_id && x.snapshot_sha256 && x.snapshot_fetched_at
        ? { id: x.snapshot_id, sha256: x.snapshot_sha256.trim(), fetchedAt: x.snapshot_fetched_at, response: x.snapshot_response }
        : null,
    capturedAt: x.captured_at,
  };
}
