import { describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { MAX_FILES, MAX_NOTES_CHARS, buildEvidenceInput, planEvidence } from '../src/evidence/plan.ts';
import type { EvidenceFacts, PlanResult } from '../src/evidence/plan.ts';

const FULL: EvidenceFacts = {
  tracking: { carrierName: 'FEDEX', trackingNumber: '122533485' },
  hasMandate: true,
  hasSnapshot: true,
  hasLedger: true,
  refundIds: [],
};
const without = (k: keyof EvidenceFacts): EvidenceFacts => ({ ...FULL, [k]: k === 'refundIds' ? [] : k === 'tracking' ? undefined : false });
const planned = (r: PlanResult) => {
  if (r.status !== 'PLANNED') throw new Error(`expected PLANNED, got BLOCKED: ${r.missing.join(',')}`);
  return r;
};

describe('planEvidence: the reason table', () => {
  it('item not received -> PROOF_OF_FULFILLMENT with tracking_info and a fulfillment record', () => {
    const p = planned(planEvidence('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', FULL));
    expect(p.evidences).toEqual([
      { evidenceType: 'PROOF_OF_FULFILLMENT', evidenceInfo: { tracking_info: [{ carrier_name: 'FEDEX', tracking_number: '122533485' }] } },
    ]);
    expect(p.documents).toEqual(['FULFILLMENT_RECORD']);
    expect(p.manualReview).toBe(false);
  });

  it('item not received without tracking is BLOCKED and names tracking_info', () => {
    expect(planEvidence('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', without('tracking'))).toEqual({
      status: 'BLOCKED',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      missing: ['tracking_info'],
    });
  });

  it('a blank carrier or tracking number counts as missing', () => {
    for (const tracking of [
      { carrierName: '  ', trackingNumber: '1' },
      { carrierName: 'UPS', trackingNumber: '' },
    ]) {
      const r = planEvidence('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', { ...FULL, tracking });
      expect(r.status).toBe('BLOCKED');
    }
  });

  it('tracking is trimmed before it is sent', () => {
    const p = planned(planEvidence('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', { ...FULL, tracking: { carrierName: ' UPS ', trackingNumber: ' 1Z9 ' } }));
    expect(p.evidences[0]!.evidenceInfo!.tracking_info).toEqual([{ carrier_name: 'UPS', tracking_number: '1Z9' }]);
  });

  it('unauthorised -> fulfillment + OTHER, with fulfillment record and mandate PDFs', () => {
    const p = planned(planEvidence('UNAUTHORISED', FULL));
    expect(p.evidences.map((e) => e.evidenceType)).toEqual(['PROOF_OF_FULFILLMENT', 'OTHER']);
    expect(p.documents).toEqual(['FULFILLMENT_RECORD', 'MANDATE_APPROVAL']);
  });

  it('unauthorised lists every missing item, not just the first', () => {
    const r = planEvidence('UNAUTHORISED', { ...FULL, tracking: undefined, hasMandate: false });
    expect(r).toMatchObject({ status: 'BLOCKED', missing: ['tracking_info', 'mandate'] });
  });

  it('not as described -> OTHER with product snapshot and mandate; blocked without either', () => {
    const p = planned(planEvidence('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', FULL));
    expect(p.evidences).toEqual([{ evidenceType: 'OTHER' }]);
    expect(p.documents).toEqual(['PRODUCT_SNAPSHOT', 'MANDATE_APPROVAL']);
    expect(planEvidence('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', { ...FULL, hasSnapshot: false, hasMandate: false })).toMatchObject({
      status: 'BLOCKED',
      missing: ['product_snapshot', 'mandate'],
    });
  });

  it.each(['INCORRECT_AMOUNT', 'DUPLICATE_TRANSACTION'])('%s -> OTHER with a ledger extract when nothing was refunded', (reason) => {
    const p = planned(planEvidence(reason, FULL));
    expect(p.evidences).toEqual([{ evidenceType: 'OTHER' }]);
    expect(p.documents).toEqual(['LEDGER_EXTRACT']);
  });

  it.each(['INCORRECT_AMOUNT', 'DUPLICATE_TRANSACTION'])('%s -> PROOF_OF_REFUND with refund_ids when a refund exists', (reason) => {
    const p = planned(planEvidence(reason, { ...FULL, refundIds: ['REF-1', 'REF-2'] }));
    expect(p.evidences).toEqual([{ evidenceType: 'PROOF_OF_REFUND', evidenceInfo: { refund_ids: ['REF-1', 'REF-2'] } }]);
  });

  it('INCORRECT_AMOUNT without a ledger is BLOCKED', () => {
    expect(planEvidence('INCORRECT_AMOUNT', without('hasLedger'))).toMatchObject({ status: 'BLOCKED', missing: ['ledger'] });
  });

  it('credit not processed -> PROOF_OF_REFUND with no files; blocked with no refund id', () => {
    const p = planned(planEvidence('CREDIT_NOT_PROCESSED', { ...FULL, refundIds: ['REF-9'] }));
    expect(p.evidences).toEqual([{ evidenceType: 'PROOF_OF_REFUND', evidenceInfo: { refund_ids: ['REF-9'] } }]);
    expect(p.documents).toEqual([]);
    expect(planEvidence('CREDIT_NOT_PROCESSED', FULL)).toMatchObject({ status: 'BLOCKED', missing: ['refund_ids'] });
  });

  it('refund ids are de-duplicated, trimmed, and blanks dropped; blank-only counts as none', () => {
    const p = planned(planEvidence('CREDIT_NOT_PROCESSED', { ...FULL, refundIds: [' R1 ', 'R1', '', '  ', 'R2'] }));
    expect(p.evidences[0]!.evidenceInfo!.refund_ids).toEqual(['R1', 'R2']);
    expect(planEvidence('CREDIT_NOT_PROCESSED', { ...FULL, refundIds: ['', ' '] }).status).toBe('BLOCKED');
  });

  it('refund ids are capped at 100', () => {
    const ids = Array.from({ length: 150 }, (_, i) => `R${i}`);
    const p = planned(planEvidence('CREDIT_NOT_PROCESSED', { ...FULL, refundIds: ids }));
    expect(p.evidences[0]!.evidenceInfo!.refund_ids).toHaveLength(100);
  });

  it('an unknown reason falls back to OTHER with everything we have, flagged for manual review', () => {
    const p = planned(planEvidence('SOMETHING_NEW', FULL));
    expect(p.evidences).toEqual([{ evidenceType: 'OTHER' }]);
    expect(p.documents).toEqual(['LEDGER_EXTRACT', 'MANDATE_APPROVAL', 'FULFILLMENT_RECORD']);
    expect(p.manualReview).toBe(true);
  });

  it('an unknown reason sends only what exists', () => {
    const p = planned(planEvidence('SOMETHING_NEW', { ...FULL, hasMandate: false, tracking: undefined }));
    expect(p.documents).toEqual(['LEDGER_EXTRACT']);
    expect(planEvidence('SOMETHING_NEW', without('hasLedger'))).toMatchObject({ status: 'BLOCKED', missing: ['ledger'] });
  });
});

describe('planEvidence: invariants over every combination of facts', () => {
  const reasons = [
    'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
    'UNAUTHORISED',
    'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
    'INCORRECT_AMOUNT',
    'DUPLICATE_TRANSACTION',
    'CREDIT_NOT_PROCESSED',
    'SOMETHING_NEW',
  ];
  const bools = [true, false];
  const combos: EvidenceFacts[] = [];
  for (const t of [undefined, FULL.tracking])
    for (const hasMandate of bools)
      for (const hasSnapshot of bools)
        for (const hasLedger of bools)
          for (const refundIds of [[], ['REF-1']]) combos.push({ tracking: t, hasMandate, hasSnapshot, hasLedger, refundIds });

  it('covers 7 reasons x 32 fact combinations', () => {
    expect(reasons.length * combos.length).toBe(224);
  });

  it('never plans more than the file limit, never plans without the required fact, always names what is missing', () => {
    for (const reason of reasons) {
      for (const facts of combos) {
        const r = planEvidence(reason, facts);
        if (r.status === 'BLOCKED') {
          expect(r.missing.length).toBeGreaterThan(0);
          continue;
        }
        expect(r.documents.length).toBeLessThanOrEqual(MAX_FILES);
        expect(new Set(r.documents).size).toBe(r.documents.length);
        for (const e of r.evidences) {
          if (e.evidenceType === 'PROOF_OF_FULFILLMENT') expect(e.evidenceInfo?.tracking_info?.length).toBe(1);
          if (e.evidenceType === 'PROOF_OF_REFUND') expect(e.evidenceInfo?.refund_ids?.length).toBeGreaterThan(0);
        }
        if (r.documents.includes('FULFILLMENT_RECORD')) expect(facts.tracking).toBeDefined();
        if (r.documents.includes('MANDATE_APPROVAL')) expect(facts.hasMandate).toBe(true);
        if (r.documents.includes('PRODUCT_SNAPSHOT')) expect(facts.hasSnapshot).toBe(true);
        if (r.documents.includes('LEDGER_EXTRACT')) expect(facts.hasLedger).toBe(true);
      }
    }
  });

  it('is deterministic and does not mutate its input', () => {
    const facts: EvidenceFacts = { ...FULL, refundIds: ['REF-1', 'REF-1'] };
    const snapshot = JSON.stringify(facts);
    const a = planEvidence('INCORRECT_AMOUNT', facts);
    const b = planEvidence('INCORRECT_AMOUNT', facts);
    expect(a).toEqual(b);
    expect(JSON.stringify(facts)).toBe(snapshot);
  });
});

describe('buildEvidenceInput', () => {
  const plan = planned(planEvidence('UNAUTHORISED', FULL));

  it('puts the same notes on every evidence and keeps evidence_info only where there is some', () => {
    const input = buildEvidenceInput(plan, '  Delivered and approved.  ');
    expect(input).toEqual({
      evidences: [
        {
          evidence_type: 'PROOF_OF_FULFILLMENT',
          evidence_info: { tracking_info: [{ carrier_name: 'FEDEX', tracking_number: '122533485' }] },
          notes: 'Delivered and approved.',
        },
        { evidence_type: 'OTHER', notes: 'Delivered and approved.' },
      ],
    });
  });

  it('accepts exactly 2000 characters and rejects 2001 instead of cutting them', () => {
    expect(() => buildEvidenceInput(plan, 'a'.repeat(MAX_NOTES_CHARS))).not.toThrow();
    expect(() => buildEvidenceInput(plan, 'a'.repeat(MAX_NOTES_CHARS + 1))).toThrow(DomainError);
  });

  it('rejects blank notes', () => {
    expect(() => buildEvidenceInput(plan, '   ')).toThrow(/notes are required/);
  });
});
