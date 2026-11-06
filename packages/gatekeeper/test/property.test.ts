import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/index.ts';
import type { Mandate, Proposal } from '../src/index.ts';
import { ctx } from './fixtures.ts';

const DAY = 86_400_000;
const base = Date.UTC(2026, 10, 5);
const day = (offset: number) => new Date(base + offset * DAY).toISOString().slice(0, 10);

const cents = fc.integer({ min: 0, max: 5_000_000 });

const arbMandate = fc.record({
  quantity: fc.integer({ min: 1, max: 500 }),
  unitCeiling: cents,
  budget: fc.integer({ min: 0, max: 400_000_000 }),
  deliverOffset: fc.integer({ min: -5, max: 60 }),
  status: fc.constantFrom('ACTIVE', 'ACTIVE', 'ACTIVE', 'PAUSED', 'CLOSED'),
  version: fc.integer({ min: 1, max: 3 }),
});
const arbProposal = fc.record({
  unitPrice: cents,
  qtyDelta: fc.constantFrom(0, 0, 0, 1, -1),
  shipping: fc.integer({ min: 0, max: 100_000 }),
  tax: fc.integer({ min: 0, max: 100_000 }),
  etaOffset: fc.integer({ min: -5, max: 60 }),
  inStock: fc.boolean(),
  version: fc.integer({ min: 1, max: 3 }),
  spent: fc.integer({ min: 0, max: 400_000_000 }),
});

describe('gatekeeper properties (1,000 random mandate/proposal pairs)', () => {
  it('pass ⇔ all rules pass, and R3/R6/R7/R8 agree with an independent plain-number recomputation', () => {
    fc.assert(
      fc.property(arbMandate, arbProposal, (a, b) => {
        const quantity = Math.max(1, a.quantity + b.qtyDelta);
        const m: Mandate = {
          id: 'm', version: a.version, sha256: 'a'.repeat(64),
          spec: { keywords: ['k'] }, quantity: a.quantity,
          unitCeiling: BigInt(a.unitCeiling), budget: BigInt(a.budget), currency: 'USD',
          deliverBy: day(a.deliverOffset), approvalThreshold: 0n,
          expiresAt: '2027-01-01T00:00:00Z', status: a.status as Mandate['status'],
        };
        const p: Proposal = {
          mandateId: 'm', mandateVersion: b.version, productId: 'p', title: 't', domain: 'd.com',
          unitPrice: BigInt(b.unitPrice), currency: 'USD', quantity,
          shipping: BigInt(b.shipping), tax: BigInt(b.tax),
          etaDate: day(b.etaOffset), inStock: b.inStock, snapshotSha256: 'b'.repeat(64),
        };
        const d = evaluate(m, p, ctx({ spentSoFar: BigInt(b.spent) }));
        const by = Object.fromEntries(d.results.map((r) => [r.id, r.pass]));

        // Never "pass" with a failing rule, and never fail with all rules passing.
        expect(d.pass).toBe(d.results.every((r) => r.pass));

        // Independent arithmetic with plain numbers (all values < 2^53).
        const total = b.unitPrice * quantity + b.shipping + b.tax;
        expect(d.total === BigInt(total)).toBe(true);
        expect(by.R3).toBe(b.unitPrice <= a.unitCeiling);
        expect(by.R6).toBe(total <= a.budget - b.spent);
        expect(by.R7).toBe(b.etaOffset <= a.deliverOffset);
        expect(by.R8).toBe(a.deliverOffset <= 29); // now is 2026-11-05 = offset 0
        expect(by.R5).toBe(quantity === a.quantity);
        expect(by.R1).toBe(a.status === 'ACTIVE');
        expect(by.R2).toBe(b.version === a.version);

        // Deterministic: same inputs ⇒ identical decision and hash.
        const again = evaluate(m, p, ctx({ spentSoFar: BigInt(b.spent) }));
        expect(again.decisionSha256).toBe(d.decisionSha256);
        expect(again.results).toEqual(d.results);
      }),
      { numRuns: 1000 },
    );
  });
});
