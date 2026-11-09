import { usd } from '@aegis/core';
import { z } from 'zod';
import { ungroundedFigures, unknownCitations } from './grounding.ts';
import { generateStructured } from './llm.ts';
import type { AgentStep, LanguageModel } from './llm.ts';
import { DEFENSE_PROMPT, dataBlock } from './prompts.ts';

/** PayPal's limit on evidence notes. Mirrors `MAX_NOTES_CHARS` in @aegis/payments (the agents package may not import it). */
export const NOTES_LIMIT = 2000;
/** The model is asked to stay under this, so a template tail or a citation never pushes the notes over the limit. */
const MODEL_NOTES_LIMIT = 1800;

/** Everything our own records say about the disputed order, read by the caller from the database. Nothing here is a PayPal secret. */
export interface DefenseInput {
  reason: string | null;
  orderId: string;
  amountMinor: bigint | null;
  capturedAt: Date | null;
  tracking?: { carrier: string; trackingNumber: string } | undefined;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  /** 'SIMULATED' when delivery was entered by the operator rather than reported by a carrier. Said plainly in the notes. */
  fulfillmentSource?: string | undefined;
  mandateHash?: string | undefined;
  approvedBy?: string | null | undefined;
  approvedAt?: Date | null | undefined;
  productTitle?: string | null | undefined;
  snapshotSha256?: string | undefined;
  snapshotFetchedAt?: Date | null | undefined;
  refundIds: readonly string[];
}

export interface Fact {
  key: string;
  text: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The numbered fact list the notes are written from. Only facts that exist are listed; a missing fact is simply absent. */
export function buildFacts(i: DefenseInput): Fact[] {
  const lines: string[] = [];
  lines.push(`Order ${i.orderId} was paid through a PayPal authorization hold that the buyer approved, and was captured${i.capturedAt ? ` on ${day(i.capturedAt)}` : ''}${i.amountMinor !== null ? ` for ${usd.format(i.amountMinor)}` : ''}.`);
  if (i.productTitle) lines.push(`The item ordered was "${i.productTitle}".`);
  if (i.tracking) {
    lines.push(`Shipping carrier ${i.tracking.carrier}, tracking number ${i.tracking.trackingNumber}.`);
    if (i.shippedAt) lines.push(`Shipment was recorded on ${day(i.shippedAt)}.`);
    if (i.deliveredAt) {
      const simulated = i.fulfillmentSource === 'SIMULATED';
      lines.push(`Delivery was recorded on ${day(i.deliveredAt)}${simulated ? ' by the seller\'s operator (a simulated carrier event, not a carrier report)' : ''}.`);
    }
  }
  // "fingerprinted", not "signed": the mandate's terms are hashed (SHA-256), and evidence sent to PayPal must not claim a
  // cryptographic signature that does not exist.
  if (i.approvedBy && i.approvedAt) lines.push(`The purchase was approved by ${i.approvedBy} on ${day(i.approvedAt)} against a recorded mandate whose terms have the SHA-256 fingerprint ${i.mandateHash ?? 'not recorded'}.`);
  if (i.snapshotSha256) lines.push(`The product listing as it appeared when the order was placed is stored with fingerprint ${i.snapshotSha256}${i.snapshotFetchedAt ? ` (captured ${day(i.snapshotFetchedAt)})` : ''}.`);
  if (i.refundIds.length) lines.push(`Refunds on record: ${i.refundIds.join(', ')}.`);
  return lines.map((text, n) => ({ key: `F${n + 1}`, text }));
}

export const factsText = (facts: readonly Fact[]): string => facts.map((f) => `${f.key}: ${f.text}`).join('\n');

/** The notes with no model: the facts, in order, each cited. Always within the limit because the fact list is short. */
export function templateNotes(facts: readonly Fact[], reason: string | null): string {
  const head = `Seller response to the dispute${reason ? ` (${reason.toLowerCase().replace(/_/g, ' ')})` : ''}. The records below are attached as documents.`;
  const body = facts.map((f) => `${f.text} [${f.key}]`).join(' ');
  const text = `${head} ${body}`;
  return text.length <= NOTES_LIMIT ? text : text.slice(0, NOTES_LIMIT - 1).replace(/\s+\S*$/, '') + '.';
}

const NotesSchema = z.object({ notes: z.string().trim().min(40).max(MODEL_NOTES_LIMIT) });

export interface DraftedNotes {
  notes: string;
  /** Who wrote it, in the form the audit log uses. */
  author: 'agent:defense' | 'system:evidence-template';
  facts: Fact[];
  step: AgentStep;
}

/**
 * The seller's account for a dispute. A model, when configured, phrases the numbered facts; the result is accepted only if
 * every figure in it is in the facts and every citation names a real fact. Otherwise (or with no model) the template is
 * used, so the notes never contain a claim our records do not hold.
 */
export async function draftEvidenceNotes(input: DefenseInput, deps: { model: LanguageModel | null }): Promise<DraftedNotes> {
  const facts = buildFacts(input);
  const text = factsText(facts);
  const keys = facts.map((f) => f.key);
  const fallback = (why: string): DraftedNotes => ({
    notes: templateNotes(facts, input.reason),
    author: 'system:evidence-template',
    facts,
    step: { task: 'defense', step: 'notes', summary: `Notes built from the template: ${why}` },
  });

  if (!deps.model) return fallback('no language model configured');
  try {
    const run = await generateStructured({
      task: 'evidence notes',
      model: deps.model,
      system: DEFENSE_PROMPT,
      prompt: `Dispute reason: ${input.reason ?? 'not stated'}\n\n${dataBlock('facts', text)}`,
      schema: NotesSchema,
      check: (v) => {
        const bad = unknownCitations(v.notes, keys);
        if (bad.length) return `cites facts that do not exist: ${bad.join(', ')}`;
        if (!/\[F\d+\]/.test(v.notes)) return 'must cite at least one fact like [F1]';
        const extra = ungroundedFigures(v.notes, text);
        if (extra.length) return `states figures that are not in the facts: ${extra.join(', ')}`;
        return null;
      },
    });
    return {
      notes: run.value.notes,
      author: 'agent:defense',
      facts,
      step: { task: 'defense', step: 'notes', summary: 'Model wrote the notes; every figure and citation checked against the facts', promptSha: run.promptSha, attempts: run.attempts },
    };
  } catch {
    return fallback('the model output failed the fact check');
  }
}
