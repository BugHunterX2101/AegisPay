import { canonicalJson } from '@aegis/core';
import { uuidv7 } from './ids.ts';
import type { Queryable, Tx } from './pool.ts';
import { getOrder } from './orders.ts';
import type { OrderRow } from './orders.ts';

export interface ProposalRow {
  id: string;
  mandateId: string;
  mandateVersion: number;
  productId: string | null;
  domain: string | null;
  title: string | null;
  unitPriceMinor: bigint | null;
  quantity: number | null;
  shippingMinor: bigint | null;
  taxMinor: bigint | null;
  eta: string | null; // 'YYYY-MM-DD'
  gatePass: boolean | null;
  decisionSha256: string | null;
}

export interface MandateRow {
  id: string;
  version: number;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  sha256: string;
  currency: string;
  expiresAt: Date;
  deliverBy: string; // 'YYYY-MM-DD'
}

export interface OrderBundle {
  order: OrderRow;
  proposal: ProposalRow;
  mandate: MandateRow;
}

interface BundleDbRow {
  p_id: string; p_mandate_id: string; p_mandate_version: number; p_product_id: string | null; p_domain: string | null;
  p_title: string | null; p_unit_price_minor: bigint | null; p_quantity: number | null; p_shipping_minor: bigint | null;
  p_tax_minor: bigint | null; p_eta: string | null; p_gate_pass: boolean | null; p_decision_sha256: string | null;
  m_id: string; m_version: number; m_status: MandateRow['status']; m_sha256: string; m_currency: string;
  m_expires_at: Date; m_deliver_by: string;
}

/**
 * The order with the exact proposal and mandate version it was gated against.
 * The payment module builds every PayPal amount and line item from THESE rows, never from caller-supplied
 * objects, so neither an agent nor a buggy route can alter what is sent to PayPal.
 */
export async function getOrderBundle(db: Queryable, orderId: string): Promise<OrderBundle | null> {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const { rows } = await db.query<BundleDbRow>(
    `select p.id p_id, p.mandate_id p_mandate_id, p.mandate_version p_mandate_version, p.product_id p_product_id,
            p.domain p_domain, p.title p_title, p.unit_price_minor p_unit_price_minor, p.quantity p_quantity,
            p.shipping_minor p_shipping_minor, p.tax_minor p_tax_minor, p.eta p_eta, p.gate_pass p_gate_pass,
            p.decision_sha256 p_decision_sha256,
            m.id m_id, m.version m_version, m.status m_status, m.sha256 m_sha256, m.currency m_currency,
            m.expires_at m_expires_at, m.deliver_by m_deliver_by
       from proposal p
       join mandate m on m.id = p.mandate_id and m.version = p.mandate_version
      where p.id = $1`,
    [order.proposalId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    order,
    proposal: {
      id: r.p_id, mandateId: r.p_mandate_id, mandateVersion: r.p_mandate_version, productId: r.p_product_id,
      domain: r.p_domain, title: r.p_title, unitPriceMinor: r.p_unit_price_minor, quantity: r.p_quantity,
      shippingMinor: r.p_shipping_minor, taxMinor: r.p_tax_minor, eta: r.p_eta, gatePass: r.p_gate_pass,
      decisionSha256: r.p_decision_sha256,
    },
    mandate: {
      id: r.m_id, version: r.m_version, status: r.m_status, sha256: r.m_sha256, currency: r.m_currency.trim(),
      expiresAt: r.m_expires_at, deliverBy: r.m_deliver_by,
    },
  };
}

/** A proposal with everything the dashboard and the dispute evidence need (ProposalRow is the narrow payment slice). */
export interface ProposalRecord extends ProposalRow {
  snapshotId: string | null;
  offerUrl: string | null;
  rating: number | null;
  inStock: boolean | null;
  rationale: string | null;
  gateResults: unknown;
  createdAt: Date;
}

interface ProposalDbRow {
  id: string; mandate_id: string; mandate_version: number; snapshot_id: string | null; product_id: string | null;
  offer_url: string | null; domain: string | null; title: string | null; unit_price_minor: bigint | null;
  quantity: number | null; shipping_minor: bigint | null; tax_minor: bigint | null; eta: string | null;
  rating: string | null; in_stock: boolean | null; rationale: string | null; gate_pass: boolean | null;
  gate_results: unknown; decision_sha256: string | null; created_at: Date;
}

const toProposal = (r: ProposalDbRow): ProposalRecord => ({
  id: r.id, mandateId: r.mandate_id, mandateVersion: r.mandate_version, snapshotId: r.snapshot_id,
  productId: r.product_id, offerUrl: r.offer_url, domain: r.domain, title: r.title,
  unitPriceMinor: r.unit_price_minor, quantity: r.quantity, shippingMinor: r.shipping_minor, taxMinor: r.tax_minor,
  eta: r.eta, rating: r.rating === null ? null : Number(r.rating), inStock: r.in_stock, rationale: r.rationale,
  gatePass: r.gate_pass, gateResults: r.gate_results, decisionSha256: r.decision_sha256, createdAt: r.created_at,
});

export interface NewProposal {
  id?: string;
  mandateId: string;
  mandateVersion: number;
  snapshotId?: string;
  productId: string;
  offerUrl?: string;
  domain: string;
  title: string;
  unitPriceMinor: bigint;
  quantity: number;
  shippingMinor: bigint;
  taxMinor: bigint;
  eta: string; // 'YYYY-MM-DD'
  rating?: number;
  inStock: boolean;
  rationale?: string;
  /** The gatekeeper's verdict for this exact proposal, recorded with the proposal so the two can never drift apart. */
  gatePass: boolean;
  gateResults: unknown;
  decisionSha256: string;
}

/**
 * Persist a proposal together with the gatekeeper decision made on it. The agent proposes; the gate decides; the row
 * stores both. The foreign key to (mandate_id, mandate_version) means a proposal can only reference terms that exist.
 */
export async function insertProposal(tx: Tx, p: NewProposal): Promise<ProposalRecord> {
  const r = await tx.query<ProposalDbRow>(
    `insert into proposal (id, mandate_id, mandate_version, snapshot_id, product_id, offer_url, domain, title,
                           unit_price_minor, quantity, shipping_minor, tax_minor, eta, rating, in_stock, rationale,
                           gate_pass, gate_results, decision_sha256)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19)
     returning *`,
    [p.id ?? uuidv7(), p.mandateId, p.mandateVersion, p.snapshotId ?? null, p.productId, p.offerUrl ?? null, p.domain,
      p.title, p.unitPriceMinor, p.quantity, p.shippingMinor, p.taxMinor, p.eta, p.rating ?? null, p.inStock,
      p.rationale ?? null, p.gatePass, canonicalJson(p.gateResults), p.decisionSha256],
  );
  return toProposal(r.rows[0]!);
}

export async function getProposalRecord(db: Queryable, id: string): Promise<ProposalRecord | null> {
  const r = await db.query<ProposalDbRow>('select * from proposal where id = $1', [id]);
  return r.rows[0] ? toProposal(r.rows[0]) : null;
}

export async function listProposalsForMandate(db: Queryable, mandateId: string, limit = 100): Promise<ProposalRecord[]> {
  const r = await db.query<ProposalDbRow>(
    'select * from proposal where mandate_id = $1 order by created_at desc, id desc limit $2',
    [mandateId, limit],
  );
  return r.rows.map(toProposal);
}
