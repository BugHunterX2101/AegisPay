/**
 * Grounding checks for model-written text. A model may phrase facts; it may not add any. These checks are mechanical, so a
 * wrong output is caught by code instead of by trusting the model: every figure in the text must already be in the facts,
 * and every citation must name a fact that exists. On failure the callers fall back to a template built from the facts.
 */

const CITATION = /\[(F\d+)\]/g;

/** Digit runs as written ("12.50", "122533485", "2026"), with thousands separators removed. Citation markers are ignored. */
export function figures(text: string): string[] {
  const withoutCitations = text.replace(CITATION, ' ');
  const found = withoutCitations.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return found.map((f) => f.replace(/,/g, '').replace(/\.$/, ''));
}

/** Figures that appear in `text` but nowhere in `facts`. Empty means every number the text states came from the facts. */
export function ungroundedFigures(text: string, facts: string): string[] {
  const known = new Set(figures(facts));
  return [...new Set(figures(text).filter((f) => !known.has(f)))];
}

/** Citation keys the text uses that are not in `keys`. */
export function unknownCitations(text: string, keys: readonly string[]): string[] {
  const allowed = new Set(keys);
  const used = [...text.matchAll(CITATION)].map((m) => m[1]!);
  return [...new Set(used.filter((k) => !allowed.has(k)))];
}
