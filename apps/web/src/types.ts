// Wire shapes of the API. Dates arrive as ISO strings and bigints as decimal strings (the API serialises both).
export type OrderState =
  | 'GATED' | 'REJECTED' | 'AWAITING_APPROVAL' | 'CANCELLED' | 'HELD' | 'IN_TRANSIT' | 'DELIVERED' | 'SETTLED'
  | 'FAILED' | 'VOIDED' | 'DISPUTED' | 'EVIDENCE_SUBMITTED' | 'RESOLVED_WON' | 'RESOLVED_LOST' | 'REFUNDED';

export interface Session {
  actor: string;
  csrfToken: string;
  judgeMode: boolean;
  paypalEnv: 'sandbox';
  paypalClientId: string;
}

export interface OrderRow {
  id: string;
  state: OrderState;
  amountMinor: string;
  currency: string;
  mandateId: string;
  mandateVersion: number;
  deliverBy: string;
  title: string | null;
  domain: string | null;
  quantity: number | null;
  unitPriceMinor: string | null;
  gatePass: boolean | null;
  decisionSha256: string | null;
  paypalOrderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  authExpiresAt: string | null;
  honorEndsAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  fulfillmentSource: string | null;
  disputeId: string | null;
  disputeStatus: string | null;
  rowVersion: number;
  updatedAt: string;
}

export interface Dispute {
  paypalDisputeId: string;
  status: string;
  orderId?: string | null;
  [k: string]: unknown;
}

export interface AuditEvent {
  seq: string;
  ts: string;
  actor: string;
  type: string;
  entity: string;
  entityId: string | null;
  payload: unknown;
  hash: string;
}

export interface Proposal {
  id: string;
  title: string;
  domain: string;
  gatePass: boolean;
  decisionSha256: string;
  unitPriceMinor: string;
  reasons?: unknown;
  [k: string]: unknown;
}

export interface MandateDraft {
  spec: { keywords: string[]; [k: string]: unknown };
  quantity: number;
  unitCeiling: string;
  budget: string;
  currency: string;
  deliverBy: string;
}

export interface ProbeResult { name: string; ok: boolean; ms: number; debugId?: string; detail?: string }
export interface SelfCheck { probes: ProbeResult[]; checkedAt: string }

/** One line in the agent drawer: an agent step, a gate verdict, a verified webhook or a drafted mandate. */
export interface FeedItem {
  key: string;
  kind: 'agent.step' | 'gate.decision' | 'webhook.verified' | 'mandate.draft';
  at: string;
  data: Record<string, unknown>;
}

export interface BundleFile { name: string; [k: string]: unknown }
export interface EvidenceBundle { id: string; files?: BundleFile[]; [k: string]: unknown }
export type PlanResult =
  | { status: 'BUILT'; bundle: EvidenceBundle; [k: string]: unknown }
  | { status: 'BLOCKED'; missing: string[]; reason: string };
