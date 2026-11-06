import { DomainError, MandateDraftSchema, minorToString, usd } from '@aegis/core';
import type { MandateDraft } from '@aegis/core';
import { z } from 'zod';
import { figures } from './grounding.ts';
import { generateStructured } from './llm.ts';
import type { AgentStep, LanguageModel } from './llm.ts';
import { PARSER_PROMPT, dataBlock } from './prompts.ts';

/** Dollars as a plain decimal string: a model that writes "$1,200" or 12.5 as a float is rejected, not guessed at. */
const Dollars = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'plain dollars like "12.50"');

/** What the model fills in. Money is dollars-as-text here and converted to minor units by code, never by the model. */
export const ParsedMandateSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  // Strict structured-output modes (OpenAI-style, also Groq's) require every property to be present. So "not stated" is an
  // empty list or null here, never an omitted key; `toDraft` turns both back into an absent field.
  mustInclude: z.array(z.string().trim().min(1).max(80)).max(12),
  mustExclude: z.array(z.string().trim().min(1).max(80)).max(12),
  quantity: z.number().int().min(1).max(100_000),
  unitCeilingUsd: Dollars,
  budgetUsd: Dollars,
  deliverBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minRating: z.number().min(0).max(5).nullable(),
  allowedDomains: z.array(z.string().trim().min(3).max(253)).max(50),
});
export type ParsedMandate = z.infer<typeof ParsedMandateSchema>;

const MAX_HORIZON_DAYS = 730;
const DAY_MS = 86_400_000;

/** Sanity rules the schema cannot express. A problem here is fed back to the model once, then the job fails. */
export function checkParsed(p: ParsedMandate, today: string): string | null {
  const when = Date.parse(`${p.deliverBy}T00:00:00Z`);
  if (Number.isNaN(when) || new Date(when).toISOString().slice(0, 10) !== p.deliverBy) return `deliverBy ${p.deliverBy} is not a real date`;
  const t0 = Date.parse(`${today}T00:00:00Z`);
  if (when < t0) return `deliverBy ${p.deliverBy} is before today (${today})`;
  if (when > t0 + MAX_HORIZON_DAYS * DAY_MS) return `deliverBy ${p.deliverBy} is more than ${MAX_HORIZON_DAYS} days away`;
  const ceiling = usd.parse(p.unitCeilingUsd);
  const budget = usd.parse(p.budgetUsd);
  if (ceiling <= 0n) return 'unitCeilingUsd must be more than zero';
  if (budget < ceiling) return 'budgetUsd is smaller than the price of a single unit';
  return null;
}

/** The validated draft the human will confirm. Money is converted here, with exact integer arithmetic. */
export function toDraft(p: ParsedMandate): MandateDraft {
  return MandateDraftSchema.parse({
    spec: {
      keywords: p.keywords,
      ...(p.mustInclude?.length ? { mustInclude: p.mustInclude } : {}),
      ...(p.mustExclude?.length ? { mustExclude: p.mustExclude } : {}),
    },
    quantity: p.quantity,
    unitCeiling: minorToString(usd.parse(p.unitCeilingUsd)),
    budget: minorToString(usd.parse(p.budgetUsd)),
    currency: 'USD',
    deliverBy: p.deliverBy,
    ...(p.minRating !== null ? { minRating: p.minRating } : {}),
    ...(p.allowedDomains?.length ? { allowedDomains: p.allowedDomains.map((d) => d.toLowerCase()) } : {}),
  });
}

/**
 * Non-blocking notices for the human who confirms the draft: a figure the model produced that the owner never wrote.
 * The draft is shown either way (the owner reads and edits it); this just points at what to double-check.
 */
export function ungroundedWarnings(p: ParsedMandate, text: string): string[] {
  const written = new Set(figures(text).map(Number));
  const warnings: string[] = [];
  if (!written.has(p.quantity)) warnings.push(`Quantity ${p.quantity} does not appear in your request. Please check it.`);
  if (!written.has(Number(p.unitCeilingUsd))) warnings.push(`Per-unit ceiling $${p.unitCeilingUsd} does not appear in your request. Please check it.`);
  if (!written.has(Number(p.budgetUsd))) warnings.push(`Budget $${p.budgetUsd} does not appear in your request. Please check it.`);
  return warnings;
}

export interface ParseResult {
  draft: MandateDraft;
  warnings: string[];
  step: AgentStep;
}

/**
 * Free text -> a mandate draft. The model gets no tools and nothing from the database; its output is schema-checked,
 * sanity-checked, converted to minor units by code and shown to a human before anything is saved.
 */
export async function parseMandateText(text: string, deps: { model: LanguageModel | null; now: Date }): Promise<ParseResult> {
  if (!deps.model) {
    throw new DomainError('AGENT_UNAVAILABLE', 'No language model is configured. Fill in the mandate form directly.');
  }
  const today = deps.now.toISOString().slice(0, 10);
  const run = await generateStructured({
    task: 'mandate draft',
    model: deps.model,
    system: PARSER_PROMPT,
    prompt: `Today's date: ${today}\n\n${dataBlock('request', text)}`,
    schema: ParsedMandateSchema,
    check: (p) => checkParsed(p, today),
  });
  return {
    draft: toDraft(run.value),
    warnings: ungroundedWarnings(run.value, text),
    step: { task: 'parser', step: 'draft', summary: 'Parsed the request into a mandate draft (not saved)', promptSha: run.promptSha, attempts: run.attempts },
  };
}
