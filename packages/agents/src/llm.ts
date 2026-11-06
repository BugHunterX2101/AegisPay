import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { DomainError } from '@aegis/core';
import { Output, generateText, isStepCount } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import { promptHash } from './prompts.ts';

export type { LanguageModel };

export const DEFAULT_MODEL_ID = 'claude-sonnet-5-5';
/** Groq model that supports strict JSON-schema output, which every agent here relies on. */
export const DEFAULT_GROQ_MODEL_ID = 'openai/gpt-oss-120b';

/**
 * The language model, if one is configured: Anthropic when ANTHROPIC_API_KEY is set, otherwise Groq when GROQ_API_KEY is.
 * No key means no model: every agent then falls back to its deterministic path (form-only mandate entry, price-ranked
 * shortlist, template notes), exactly as the design's fallback table says. The model is a choice of provider package;
 * no agent code depends on which one it is.
 */
export function modelFromEnv(env: Record<string, string | undefined> = process.env): LanguageModel | null {
  const override = env.AEGIS_LLM_MODEL?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) return createAnthropic({ apiKey: anthropicKey })(override || DEFAULT_MODEL_ID);
  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) return createGroq({ apiKey: groqKey })(override || DEFAULT_GROQ_MODEL_ID);
  return null;
}

/** One line of what an agent did, written to the audit log by the caller (actor `agent:<task>`). */
export interface AgentStep {
  task: 'parser' | 'sourcing' | 'defense';
  step: string;
  summary: string;
  promptSha?: string;
  attempts?: number;
}

export interface StructuredRun<T> {
  value: T;
  attempts: number;
  promptSha: string;
}

/**
 * One model call that must return an object matching `schema`, and (optionally) pass `check`. The design allows two
 * tries: on a rejected answer the reason is fed back once, and if the second answer is also rejected the job fails
 * visibly instead of retrying silently.
 */
export async function generateStructured<T>(o: {
  task: string;
  model: LanguageModel;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Return a problem description to reject an otherwise valid object, or null to accept it. */
  check?: (value: T) => string | null;
  maxAttempts?: number;
}): Promise<StructuredRun<T>> {
  const max = o.maxAttempts ?? 2;
  const promptSha = promptHash(o.system);
  let feedback = '';
  let lastProblem = 'no answer';

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const result = await generateText({
        model: o.model,
        system: o.system,
        prompt: feedback ? `${o.prompt}\n\nYour previous answer was rejected: ${feedback}\nAnswer again, fixing that.` : o.prompt,
        output: Output.object({ schema: o.schema }),
        stopWhen: isStepCount(1),
        temperature: 0,
      });
      const value = result.output as T;
      const problem = o.check ? o.check(value) : null;
      if (problem === null) return { value, attempts: attempt, promptSha };
      lastProblem = feedback = problem;
    } catch (err) {
      lastProblem = feedback = err instanceof Error ? err.message.slice(0, 300) : 'model call failed';
    }
  }
  throw new DomainError('AGENT_UNAVAILABLE', `Agent could not produce a valid ${o.task}: ${lastProblem}`, { details: { attempts: max, promptSha } });
}
