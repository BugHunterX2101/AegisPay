import { canonicalJson, sha256Hex } from '@aegis/core';
import { RULES, computeTotal } from './rules.ts';
import type { Context, Decision, Mandate, Proposal } from './types.ts';

const finiteOrTag = (n: number | undefined): number | string | undefined =>
  n === undefined || Number.isFinite(n) ? n : String(n);

/** canonicalJson rejects NaN/Infinity by design; a malformed proposal must still be decided (and fail), not throw. */
const hashable = (p: Proposal) => ({
  ...p,
  quantity: finiteOrTag(p.quantity),
  rating: finiteOrTag(p.rating),
});

/**
 * Pure, total and deterministic. Every rule is evaluated (no short-circuit) so the UI and the
 * dispute evidence show the whole checklist. No I/O, no clock, no LLM.
 */
export function evaluate(mandate: Mandate, proposal: Proposal, context: Context): Decision {
  const results = RULES.map((rule) => rule(mandate, proposal, context));
  const decisionSha256 = sha256Hex(
    canonicalJson({ mandateSha: mandate.sha256, proposal: hashable(proposal), results }),
  );
  return {
    pass: results.every((x) => x.pass),
    results,
    total: computeTotal(proposal) ?? 0n,
    decisionSha256,
  };
}
