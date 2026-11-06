import { usd } from '@aegis/core';
import { z } from 'zod';
import type { CatalogProduct, CatalogSearch } from './channel3.ts';
import { ungroundedFigures } from './grounding.ts';
import { generateStructured } from './llm.ts';
import type { AgentStep, LanguageModel } from './llm.ts';
import { RATIONALE_PROMPT, dataBlock } from './prompts.ts';

export interface SourcingMandate {
  spec: { keywords: string[]; mustInclude?: string[]; mustExclude?: string[] };
  quantity: number;
  unitCeiling: bigint;
}

/** One product x one offer, as the design says. The gatekeeper judges each; the agent only proposes. */
export interface Candidate {
  productId: string;
  title: string;
  domain: string;
  offerUrl: string;
  unitPriceMinor: bigint;
  rating: number | null;
  ratingCount: number | null;
  inStock: boolean;
  features: string[];
  /**
   * What is stored as the proposal's catalog snapshot (and later read by the dispute evidence): the product and offer
   * exactly as the catalog returned them, plus `title` and `features` at the top level for the product-snapshot PDF.
   */
  snapshot: Record<string, unknown>;
  rationale: string;
}

const MAX_QUERY_CHARS = 200;
export const MAX_CANDIDATES = 8;

/** The search text: the mandate's keywords, then any must-include words not already there. */
export function buildQuery(spec: SourcingMandate['spec']): string {
  const words: string[] = [];
  for (const w of [...spec.keywords, ...(spec.mustInclude ?? [])]) {
    const t = w.trim();
    if (t && !words.some((x) => x.toLowerCase() === t.toLowerCase())) words.push(t);
  }
  return words.join(' ').slice(0, MAX_QUERY_CHARS).trim();
}

const money = (m: bigint) => usd.format(m);

function templateRationale(c: Omit<Candidate, 'rationale'>, ceiling: bigint): string {
  const parts = [`${c.domain} lists it at ${money(c.unitPriceMinor)} per unit (mandate ceiling ${money(ceiling)})`];
  if (c.rating !== null) parts.push(`rated ${c.rating.toFixed(1)} out of 5${c.ratingCount ? ` from ${c.ratingCount} reviews` : ''}`);
  parts.push(c.inStock ? 'in stock' : 'not in stock');
  return `${parts.join(', ')}.`;
}

function toCandidates(products: readonly CatalogProduct[], query: unknown): Omit<Candidate, 'rationale'>[] {
  const out: Omit<Candidate, 'rationale'>[] = [];
  for (const p of products) {
    for (const o of p.offers) {
      if (o.currency !== 'USD') continue; // mandates are USD only; a foreign-currency price cannot be compared to the ceiling
      out.push({
        productId: p.id,
        title: p.title,
        domain: o.domain,
        offerUrl: o.url,
        unitPriceMinor: o.priceMinor,
        rating: p.rating,
        ratingCount: p.ratingCount,
        inStock: o.inStock,
        features: p.features,
        snapshot: {
          source: 'channel3',
          productId: p.id,
          title: p.title,
          features: p.features,
          query,
          product: p.raw,
          offer: o.raw,
        },
      });
    }
  }
  return out;
}

/** In stock first, then cheapest, then best rated, then by id so equal inputs always give the same order. */
function compare(a: Omit<Candidate, 'rationale'>, b: Omit<Candidate, 'rationale'>): number {
  if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
  if (a.unitPriceMinor !== b.unitPriceMinor) return a.unitPriceMinor < b.unitPriceMinor ? -1 : 1;
  const ra = a.rating ?? -1;
  const rb = b.rating ?? -1;
  if (ra !== rb) return rb - ra;
  return `${a.productId}|${a.offerUrl}`.localeCompare(`${b.productId}|${b.offerUrl}`);
}

const RationaleSchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string().min(1).max(240) })).min(1).max(MAX_CANDIDATES),
});

export interface SourcingResult {
  candidates: Candidate[];
  steps: AgentStep[];
}

/**
 * Catalog results -> a ranked shortlist with a one-line reason each. Ranking is deterministic code (price, stock, rating);
 * the model, when there is one, only phrases the reasons, and a reason that states a figure not in the facts is replaced by
 * the template. Nothing here touches the database or PayPal.
 */
export async function shortlist(search: CatalogSearch, mandate: SourcingMandate, deps: { model: LanguageModel | null }): Promise<SourcingResult> {
  const steps: AgentStep[] = [];
  const base = toCandidates(search.products, search.requestBody).sort(compare).slice(0, MAX_CANDIDATES);
  steps.push({
    task: 'sourcing',
    step: 'search',
    summary: `Catalog returned ${search.products.length} products; ${base.length} offers shortlisted${search.skipped ? `, ${search.skipped} entries skipped (unexpected shape)` : ''}`,
  });

  const templates = base.map((c) => templateRationale(c, mandate.unitCeiling));
  let texts = templates;

  if (deps.model && base.length > 0) {
    const ids = base.map((_, i) => `C${i + 1}`);
    const facts = [
      `Mandate: ${mandate.spec.keywords.join(', ')}; quantity ${mandate.quantity}; ceiling ${money(mandate.unitCeiling)} per unit`,
      ...base.map(
        (c, i) =>
          `${ids[i]}: ${c.title} | ${c.domain} | ${money(c.unitPriceMinor)} per unit | ${c.inStock ? 'in stock' : 'not in stock'}` +
          (c.rating !== null ? ` | rating ${c.rating.toFixed(1)}/5` : '') +
          (c.features.length ? ` | features: ${c.features.slice(0, 5).join('; ')}` : ''),
      ),
    ].join('\n');
    try {
      const run = await generateStructured({
        task: 'shortlist rationale',
        model: deps.model,
        system: RATIONALE_PROMPT,
        prompt: `Write one sentence for each offer id.\n\n${dataBlock('facts', facts)}`,
        schema: RationaleSchema,
        check: (v) => {
          const got = v.items.map((i) => i.id).sort().join(',');
          if (got !== [...ids].sort().join(',')) return `answer must contain exactly the ids ${ids.join(', ')}, once each`;
          for (const i of v.items) {
            const extra = ungroundedFigures(i.text, facts);
            if (extra.length) return `${i.id} states figures that are not in the facts: ${extra.join(', ')}`;
          }
          return null;
        },
      });
      const byId = new Map(run.value.items.map((i) => [i.id, i.text]));
      texts = ids.map((id, i) => byId.get(id) ?? templates[i]!);
      steps.push({ task: 'sourcing', step: 'rationale', summary: 'Model wrote the reasons; every figure checked against the facts', promptSha: run.promptSha, attempts: run.attempts });
    } catch {
      steps.push({ task: 'sourcing', step: 'rationale', summary: 'Model reasons rejected; used the template reasons built from the facts' });
    }
  } else {
    steps.push({ task: 'sourcing', step: 'rationale', summary: 'No language model configured; used the template reasons built from the facts' });
  }

  return { candidates: base.map((c, i) => ({ ...c, rationale: texts[i]! })), steps };
}
