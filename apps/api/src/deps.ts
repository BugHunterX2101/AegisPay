import type { Channel3Config, LanguageModel } from '@aegis/agents';
import type { Clock, OffsetClock } from '@aegis/core';
import type { Db } from '@aegis/db';
import type { JobSender } from '@aegis/jobs';
import type { PayPalContext } from '@aegis/payments';

/** Everything a route may touch. Injected, so tests run the real routes against real Postgres and the PayPal contract server. */
export interface ApiDeps {
  db: Db;
  ctx: PayPalContext;
  /** The app clock (Judge Mode's offset applies to it). PayPal's own clock is never touched. */
  clock: Clock;
  jobs: JobSender;
  /** Public base URL of this app: PayPal's return and cancel URLs are built from it. */
  appUrl: string;
  /** The hosted language model, or null when no key is configured (the parser then answers AGENT_UNAVAILABLE). */
  model?: LanguageModel | null;
  /** The live catalog (Channel3), or null when no key is configured (sourcing then answers AGENT_UNAVAILABLE). */
  channel3?: Channel3Config | null;
  /** The settable clock behind `clock`, present when the process runs one. Judge Mode's demo routes move it. */
  demoClock?: OffsetClock;
}

export type Log = (level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) => void;
