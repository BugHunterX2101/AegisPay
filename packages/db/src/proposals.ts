import type { Queryable } from './pool.ts';
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
