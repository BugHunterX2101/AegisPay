import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '@aegis/core';
import { evaluate, hasWholeWord, normalizeDomain, computeTotal } from '../src/index.ts';
import type { Mandate, Proposal, RuleId, Context } from '../src/index.ts';
import { ctx, mandate, proposal } from './fixtures.ts';

const result = (id: RuleId, m: Mandate, p: Proposal, c: Context = ctx()) =>
  evaluate(m, p, c).results.find((r) => r.id === id)!;

describe('baseline', () => {
  it('a fully valid proposal passes all 11 rules, in order', () => {
    const d = evaluate(mandate(), proposal(), ctx());
    expect(d.results.map((r) => r.id)).toEqual(
      ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11'],
    );
    expect(d.results.every((r) => r.pass)).toBe(true);
    expect(d.pass).toBe(true);
    expect(d.total).toBe(171000n);
  });

  it('evaluates every rule (no short-circuit) when several fail', () => {
    const d = evaluate(
      mandate(),
      proposal({ unitPrice: 99999n, inStock: false, currency: 'USD', quantity: 3 }),
      ctx(),
    );
    expect(d.results).toHaveLength(11);
    expect(d.pass).toBe(false);
    expect(d.results.filter((r) => !r.pass).map((r) => r.id)).toEqual(['R3', 'R5', 'R6', 'R10']);
  });

  it('decisionSha256 = sha256(canonicalJson({mandateSha, proposal, results})) and is stable', () => {
    const m = mandate();
    const p = proposal();
    const d = evaluate(m, p, ctx());
    expect(d.decisionSha256).toBe(
      sha256Hex(canonicalJson({ mandateSha: m.sha256, proposal: p, results: d.results })),
    );
    expect(evaluate(m, p, ctx()).decisionSha256).toBe(d.decisionSha256);
    expect(evaluate(m, proposal({ unitPrice: 16999n }), ctx()).decisionSha256).not.toBe(d.decisionSha256);
    expect(evaluate(mandate({ sha256: 'c'.repeat(64) }), p, ctx()).decisionSha256).not.toBe(d.decisionSha256);
  });
});

const NOW_Z = '2026-11-05T12:00:00Z';

describe('R1 mandate active and not expired', () => {
  it('passes while ACTIVE and before expiry (inclusive at expiry)', () => {
    expect(result('R1', mandate(), proposal()).pass).toBe(true);
    expect(result('R1', mandate({ expiresAt: NOW_Z }), proposal()).pass).toBe(true);
  });
  it('fails when PAUSED, CLOSED, expired or unparseable', () => {
    expect(result('R1', mandate({ status: 'PAUSED' }), proposal()).pass).toBe(false);
    expect(result('R1', mandate({ status: 'CLOSED' }), proposal()).pass).toBe(false);
    expect(result('R1', mandate({ expiresAt: '2026-11-05T11:59:59Z' }), proposal()).pass).toBe(false);
    const bad = result('R1', mandate({ expiresAt: 'tomorrow' }), proposal());
    expect(bad.pass).toBe(false);
    expect(bad.actual).toContain('unparseable');
    expect(result('R1', mandate(), proposal(), ctx({ now: '2026-11-05T12:00:00' })).pass).toBe(false);
  });
});

describe('R2 mandate version', () => {
  it('passes for the current version', () => expect(result('R2', mandate(), proposal()).pass).toBe(true));
  it('fails for a stale version or another mandate', () => {
    expect(result('R2', mandate({ version: 2 }), proposal()).pass).toBe(false);
    expect(result('R2', mandate(), proposal({ mandateId: 'other' })).pass).toBe(false);
  });
});

describe('R3 unit price ceiling (ceiling ± 1 cent)', () => {
  it('passes at the ceiling and one cent below', () => {
    expect(result('R3', mandate(), proposal({ unitPrice: 18000n })).pass).toBe(true);
    expect(result('R3', mandate(), proposal({ unitPrice: 17999n })).pass).toBe(true);
  });
  it('fails one cent above, with exact expected/actual', () => {
    const r = result('R3', mandate(), proposal({ unitPrice: 18001n }));
    expect(r).toMatchObject({ id: 'R3', pass: false, expected: '0 <= 18000', actual: '18001' });
  });
  it('fails a negative price', () => {
    expect(result('R3', mandate(), proposal({ unitPrice: -1n })).pass).toBe(false);
  });
});

describe('R4 currency', () => {
  it('passes when equal', () => expect(result('R4', mandate(), proposal()).pass).toBe(true));
  it('fails when different', () => {
    const r = result('R4', mandate(), proposal({ currency: 'EUR' as 'USD' }));
    expect(r).toMatchObject({ pass: false, expected: 'USD', actual: 'EUR' });
  });
});

describe('R5 quantity', () => {
  it('passes when equal', () => expect(result('R5', mandate(), proposal()).pass).toBe(true));
  it('fails when different', () => {
    expect(result('R5', mandate(), proposal({ quantity: 9 }))).toMatchObject({
      pass: false,
      expected: '10',
      actual: '9',
    });
  });
});

describe('R6 total within remaining budget', () => {
  it('passes exactly at the remaining budget', () => {
    // 17000*10 + 1000 + 0 = 171000; budget 200000 - spent 29000 = 171000
    expect(result('R6', mandate(), proposal(), ctx({ spentSoFar: 29000n })).pass).toBe(true);
  });
  it('fails one cent over, with exact numbers', () => {
    const r = result('R6', mandate(), proposal(), ctx({ spentSoFar: 29001n }));
    expect(r).toMatchObject({ pass: false, expected: '<= 170999', actual: '171000' });
  });
  it('includes shipping and tax and uses bigint arithmetic for large quantities', () => {
    const m = mandate({ quantity: 1_000_000, budget: 10_000_000_000_000n, unitCeiling: 99_999_999n });
    const p = proposal({ quantity: 1_000_000, unitPrice: 9_999_999n, shipping: 5n, tax: 7n });
    expect(computeTotal(p)).toBe(9_999_999n * 1_000_000n + 12n);
    expect(result('R6', m, p).pass).toBe(true);
  });
  it('treats zero shipping as valid', () => {
    expect(result('R6', mandate(), proposal({ shipping: 0n })).pass).toBe(true);
  });
  it('fails (never throws) on an invalid quantity or negative amounts', () => {
    for (const p of [
      proposal({ quantity: 0 }),
      proposal({ quantity: 1.5 }),
      proposal({ quantity: Number.NaN }),
      proposal({ shipping: -1n }),
      proposal({ tax: -1n }),
    ]) {
      const d = evaluate(mandate(), p, ctx());
      expect(d.results.find((r) => r.id === 'R6')!.pass).toBe(false);
      expect(d.total).toBe(0n);
    }
  });
});

describe('R7 arrives on time', () => {
  it('passes on the deadline day and before', () => {
    expect(result('R7', mandate(), proposal({ etaDate: '2026-11-25' })).pass).toBe(true);
    expect(result('R7', mandate(), proposal({ etaDate: '2026-11-01' })).pass).toBe(true);
  });
  it('fails the day after', () => {
    expect(result('R7', mandate(), proposal({ etaDate: '2026-11-26' }))).toMatchObject({
      pass: false,
      expected: '<= 2026-11-25',
      actual: '2026-11-26',
    });
  });
  it('fails on malformed or impossible dates', () => {
    expect(result('R7', mandate(), proposal({ etaDate: '2026-02-31' })).pass).toBe(false);
    expect(result('R7', mandate(), proposal({ etaDate: 'soon' })).pass).toBe(false);
    expect(result('R7', mandate({ deliverBy: 'x' }), proposal()).pass).toBe(false);
  });
});

describe('R8 delivery window fits the 29-day authorization', () => {
  it('passes on now + 29 days (UTC day) and fails on now + 30', () => {
    expect(result('R8', mandate({ deliverBy: '2026-12-04' }), proposal()).pass).toBe(true);
    expect(result('R8', mandate({ deliverBy: '2026-12-05' }), proposal())).toMatchObject({
      pass: false,
      expected: '<= 2026-12-04',
    });
  });
  it('fails on malformed deliverBy or now', () => {
    expect(result('R8', mandate({ deliverBy: 'x' }), proposal()).pass).toBe(false);
    const r = result('R8', mandate(), proposal(), ctx({ now: 'garbage' }));
    expect(r.pass).toBe(false);
    expect(r.expected).toBe('<= now + 29 days');
  });
});

describe('R9 supplier allowed and rated', () => {
  it('passes for an allowed domain with sufficient rating (case/www/dot-insensitive)', () => {
    expect(result('R9', mandate(), proposal({ domain: 'WWW.Shop.Example.com.' })).pass).toBe(true);
    expect(result('R9', mandate(), proposal({ rating: 4 })).pass).toBe(true);
  });
  it('fails for a domain outside the allow-list (and a lookalike subdomain)', () => {
    expect(result('R9', mandate(), proposal({ domain: 'evil.example.net' })).pass).toBe(false);
    expect(result('R9', mandate(), proposal({ domain: 'shop.example.com.evil.net' })).pass).toBe(false);
  });
  it('fails for a low or unknown rating when minRating is set', () => {
    expect(result('R9', mandate(), proposal({ rating: 3.9 })).pass).toBe(false);
    expect(result('R9', mandate(), proposal({ rating: undefined })).pass).toBe(false);
  });
  it('accepts any domain/rating when no constraints are set', () => {
    const m = mandate({ allowedDomains: undefined, minRating: undefined });
    expect(result('R9', m, proposal({ domain: 'anything.io', rating: undefined })).pass).toBe(true);
    expect(result('R9', mandate({ allowedDomains: [], minRating: undefined }), proposal({ domain: 'a.io' })).pass).toBe(true);
  });
});

describe('R10 in stock', () => {
  it('passes when in stock', () => expect(result('R10', mandate(), proposal()).pass).toBe(true));
  it('fails when out of stock', () => {
    expect(result('R10', mandate(), proposal({ inStock: false }))).toMatchObject({
      pass: false,
      actual: 'out of stock',
    });
  });
});

describe('R11 spec match (whole word, case-insensitive)', () => {
  it('passes when mustInclude is present and mustExclude absent', () => {
    expect(result('R11', mandate(), proposal({ title: 'USB-C CABLE 2m' })).pass).toBe(true);
  });
  it('fails when a mustInclude term is missing, or only a substring', () => {
    expect(result('R11', mandate(), proposal({ title: 'Braided charger' }))).toMatchObject({
      pass: false,
      actual: 'missing "cable"',
    });
    expect(result('R11', mandate(), proposal({ title: 'Cableway kit' })).pass).toBe(false);
  });
  it('fails when a mustExclude term is present as a whole word, passes for a substring', () => {
    expect(result('R11', mandate(), proposal({ title: 'Refurbished USB-C Cable' }))).toMatchObject({
      pass: false,
      actual: 'contains excluded "refurbished"',
    });
    expect(result('R11', mandate(), proposal({ title: 'Cable (not-refurbishedish)' })).pass).toBe(true);
  });
  it('handles no spec terms, blank terms and regex metacharacters', () => {
    const m = mandate({ spec: { keywords: ['x'] } });
    expect(result('R11', m, proposal()).pass).toBe(true);
    const blank = mandate({ spec: { keywords: ['x'], mustInclude: ['  '], mustExclude: [''] } });
    expect(result('R11', blank, proposal()).pass).toBe(true);
    const meta = mandate({ spec: { keywords: ['x'], mustInclude: ['c++ (v2)'] } });
    expect(result('R11', meta, proposal({ title: 'Compiler c++ (v2) edition' })).pass).toBe(true);
  });
});

describe('helpers', () => {
  it('hasWholeWord respects unicode boundaries', () => {
    expect(hasWholeWord('Café au lait', 'café')).toBe(true);
    expect(hasWholeWord('Cafébar', 'café')).toBe(false);
    expect(hasWholeWord('anything', '')).toBe(false);
  });
  it('normalizeDomain', () => expect(normalizeDomain(' WWW.A.com. ')).toBe('a.com'));
});
