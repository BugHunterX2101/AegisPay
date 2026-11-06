import { DomainError } from '@aegis/core';

/** PayPal's dispute reasons are an open set, so this is a string. The ones below have a specific plan. */
export type DisputeReason = string;

export type EvidenceType = 'PROOF_OF_FULFILLMENT' | 'PROOF_OF_REFUND' | 'OTHER';

/** The PDFs the code can build from stored facts. */
export type DocumentKind = 'FULFILLMENT_RECORD' | 'MANDATE_APPROVAL' | 'PRODUCT_SNAPSHOT' | 'LEDGER_EXTRACT';

/** What is known, from our own records, about the disputed order. Missing means we do not have it. */
export interface EvidenceFacts {
  tracking?: { carrierName: string; trackingNumber: string } | undefined;
  /** An approved mandate with its hash exists for this order. */
  hasMandate: boolean;
  /** A stored Channel3 product snapshot exists for this order. */
  hasSnapshot: boolean;
  /** Approval, authorization and capture are all on record (the ledger extract). */
  hasLedger: boolean;
  /** PayPal refund ids recorded against the capture. */
  refundIds: readonly string[];
}

export interface PlannedEvidence {
  evidenceType: EvidenceType;
  evidenceInfo?: { tracking_info?: { carrier_name: string; tracking_number: string }[]; refund_ids?: string[] };
}

export type PlanResult =
  | { status: 'PLANNED'; reason: DisputeReason; evidences: PlannedEvidence[]; documents: DocumentKind[]; manualReview: boolean }
  | { status: 'BLOCKED'; reason: DisputeReason; missing: string[] };

/** PayPal accepts up to 100 refund ids; we send at most 3 files. */
export const MAX_FILES = 3;
export const MAX_NOTES_CHARS = 2000;
const MAX_REFUND_IDS = 100;

const clean = (s: string | undefined) => (s ?? '').trim();

function trackingInfo(f: EvidenceFacts) {
  const carrier = clean(f.tracking?.carrierName);
  const number = clean(f.tracking?.trackingNumber);
  return carrier && number ? [{ carrier_name: carrier, tracking_number: number }] : null;
}

function refundIds(f: EvidenceFacts): string[] {
  return [...new Set(f.refundIds.map((r) => r.trim()).filter(Boolean))].slice(0, MAX_REFUND_IDS);
}

/**
 * Which evidence PayPal expects for a dispute reason, and what we can honestly send.
 * Pure: no I/O, no clock, no LLM. If a required fact is missing it says which one instead of sending a weaker case.
 * Mapping follows the TDD "Evidence plan by reason" table.
 */
export function planEvidence(reason: DisputeReason, facts: EvidenceFacts): PlanResult {
  const blocked = (...missing: string[]): PlanResult => ({ status: 'BLOCKED', reason, missing });
  const planned = (evidences: PlannedEvidence[], documents: DocumentKind[], manualReview = false): PlanResult => {
    if (documents.length > MAX_FILES) throw new DomainError('INTERNAL', `evidence plan needs ${documents.length} files, the limit is ${MAX_FILES}`);
    return { status: 'PLANNED', reason, evidences, documents, manualReview };
  };
  const tracking = trackingInfo(facts);
  const fulfilment = (): PlannedEvidence => ({ evidenceType: 'PROOF_OF_FULFILLMENT', evidenceInfo: { tracking_info: tracking! } });

  switch (reason) {
    case 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED':
      if (!tracking) return blocked('tracking_info');
      return planned([fulfilment()], ['FULFILLMENT_RECORD']);

    case 'UNAUTHORISED': {
      const missing = [...(tracking ? [] : ['tracking_info']), ...(facts.hasMandate ? [] : ['mandate'])];
      if (missing.length) return blocked(...missing);
      return planned([fulfilment(), { evidenceType: 'OTHER' }], ['FULFILLMENT_RECORD', 'MANDATE_APPROVAL']);
    }

    case 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED': {
      const missing = [...(facts.hasSnapshot ? [] : ['product_snapshot']), ...(facts.hasMandate ? [] : ['mandate'])];
      if (missing.length) return blocked(...missing);
      return planned([{ evidenceType: 'OTHER' }], ['PRODUCT_SNAPSHOT', 'MANDATE_APPROVAL']);
    }

    case 'INCORRECT_AMOUNT':
    case 'DUPLICATE_TRANSACTION': {
      if (!facts.hasLedger) return blocked('ledger');
      const ids = refundIds(facts);
      return planned(
        [ids.length ? { evidenceType: 'PROOF_OF_REFUND', evidenceInfo: { refund_ids: ids } } : { evidenceType: 'OTHER' }],
        ['LEDGER_EXTRACT'],
      );
    }

    case 'CREDIT_NOT_PROCESSED': {
      const ids = refundIds(facts);
      if (!ids.length) return blocked('refund_ids');
      return planned([{ evidenceType: 'PROOF_OF_REFUND', evidenceInfo: { refund_ids: ids } }], []);
    }

    default: {
      // Unknown reason: send what we have as OTHER and say so, so a human looks at it before it goes.
      if (!facts.hasLedger) return blocked('ledger');
      const docs: DocumentKind[] = ['LEDGER_EXTRACT'];
      if (facts.hasMandate) docs.push('MANDATE_APPROVAL');
      if (tracking) docs.push('FULFILLMENT_RECORD');
      return planned([{ evidenceType: 'OTHER' }], docs, true);
    }
  }
}

/** The `input` JSON part of provide-evidence. Notes are never silently cut: over the limit is a validation error. */
export function buildEvidenceInput(plan: Extract<PlanResult, { status: 'PLANNED' }>, notes: string) {
  const text = notes.trim();
  if (!text) throw new DomainError('VALIDATION', 'evidence notes are required');
  if (text.length > MAX_NOTES_CHARS) throw new DomainError('VALIDATION', `evidence notes are ${text.length} characters, the limit is ${MAX_NOTES_CHARS}`);
  return {
    evidences: plan.evidences.map((e) => ({
      evidence_type: e.evidenceType,
      ...(e.evidenceInfo ? { evidence_info: e.evidenceInfo } : {}),
      notes: text,
    })),
  };
}
