import { DomainError, canonicalJson, sha256Hex } from '@aegis/core';
import { uuidv7 } from './ids.ts';
import type { Queryable, Tx } from './pool.ts';

export interface CatalogSnapshot {
  id: string;
  queryHash: string | null;
  response: unknown;
  sha256: string;
  fetchedAt: Date;
}

interface SnapshotDbRow {
  id: string; query_hash: string | null; response: unknown; sha256: string; fetched_at: Date;
}

const toSnapshot = (r: SnapshotDbRow): CatalogSnapshot => ({
  id: r.id,
  queryHash: r.query_hash,
  response: r.response,
  sha256: r.sha256,
  fetchedAt: r.fetched_at,
});

/** Fingerprint of a catalog response: sha256 over canonical JSON, so key order never changes it. */
export const snapshotSha256 = (response: unknown): string => sha256Hex(canonicalJson(response));

/** Fingerprint of the search that produced a snapshot (keywords etc.), to group snapshots by query. */
export const catalogQueryHash = (query: unknown): string => sha256Hex(canonicalJson(query));

/**
 * Store exactly what the catalog returned, with its fingerprint. A proposal points at one snapshot, and the gate
 * decision hashes that fingerprint, so the evidence later shows the very prices the agent saw (dispute evidence
 * reads this row). The response must be JSON-safe: canonicalJson throws on a function, symbol or non-finite number.
 */
export async function insertCatalogSnapshot(
  tx: Tx,
  s: { response: unknown; fetchedAt: Date; query?: unknown; id?: string },
): Promise<CatalogSnapshot> {
  const sha256 = snapshotSha256(s.response);
  const r = await tx.query<SnapshotDbRow>(
    `insert into catalog_snapshot (id, query_hash, response, sha256, fetched_at)
     values ($1, $2, $3::jsonb, $4, $5) returning *`,
    [s.id ?? uuidv7(), s.query === undefined ? null : catalogQueryHash(s.query), canonicalJson(s.response), sha256, s.fetchedAt],
  );
  return toSnapshot(r.rows[0]!);
}

export async function getCatalogSnapshot(db: Queryable, id: string): Promise<CatalogSnapshot | null> {
  const r = await db.query<SnapshotDbRow>('select * from catalog_snapshot where id = $1', [id]);
  return r.rows[0] ? toSnapshot(r.rows[0]) : null;
}

/** Recompute the fingerprint from the stored response. False means the row was altered after it was written. */
export const snapshotIntact = (s: CatalogSnapshot): boolean => snapshotSha256(s.response) === s.sha256;

/** Throws NOT_FOUND / INTERNAL instead of returning null or false, for callers that cannot continue without it. */
export async function requireIntactSnapshot(db: Queryable, id: string): Promise<CatalogSnapshot> {
  const s = await getCatalogSnapshot(db, id);
  if (!s) throw new DomainError('NOT_FOUND', `Catalog snapshot ${id} not found`);
  if (!snapshotIntact(s)) throw new DomainError('INTERNAL', `Catalog snapshot ${id} no longer matches its sha256`);
  return s;
}
