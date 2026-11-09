import { DomainError } from '@aegis/core';
import {
  appendAudit,
  claimVerifiedWebhooks,
  listUnverifiedWebhooks,
  markWebhookProcessed,
  markWebhookVerified,
  recordWebhookFailure,
  withTx,
} from '@aegis/db';
import type { PayPalContext } from '../client.ts';
import { processWebhookEvent } from './process.ts';
import type { WebhookOutcome } from './process.ts';
import type { CertCache } from './verify-offline.ts';
import { verifyWebhookEvent } from './verify.ts';

/** TDD: a processing failure retries the job 3 times; after that the event is closed with its error kept. */
export const WEBHOOK_MAX_ATTEMPTS = 3;

export interface WebhookPipeline {
  ctx: PayPalContext;
  certs: CertCache;
  /** PayPal's webhook id (PAYPAL_WEBHOOK_ID). Without it nothing can be verified, so nothing is acted on. */
  webhookId: string | undefined;
  maxAttempts?: number;
}

export interface VerifyPass {
  verified: number;
  rejected: number;
  retrying: number;
  gaveUp: number;
}

/**
 * Check the signature of events that arrived but were never verified. A FAILED event is closed straight away: it is
 * recorded and visible, and changes nothing. A transport failure to PayPal is not a verdict, so it counts as an attempt
 * and the event is tried again on the next pass.
 */
export async function verifyPendingWebhooks(p: WebhookPipeline, opts: { olderThanMs?: number; limit?: number } = {}): Promise<VerifyPass> {
  const pass: VerifyPass = { verified: 0, rejected: 0, retrying: 0, gaveUp: 0 };
  if (!p.webhookId) return pass; // fail closed: an unverifiable event stays unverified and untouched
  const max = p.maxAttempts ?? WEBHOOK_MAX_ATTEMPTS;
  for (const ev of await listUnverifiedWebhooks(p.ctx.db, opts.olderThanMs ?? 0, opts.limit ?? 50)) {
    try {
      const v = await verifyWebhookEvent(p.ctx, { eventId: ev.eventId, raw: ev.rawBody, headers: ev.headers, webhookId: p.webhookId, certs: p.certs });
      // The verdict and its audit row commit together: the audit chain (and the live stream built on it) only ever
      // shows a verification that is really stored.
      await withTx(async (tx) => {
        const changed = await markWebhookVerified(tx, ev.eventId, v.method, v.ok ? undefined : v.reason);
        if (!changed) return;
        await appendAudit(tx, {
          actor: 'system:webhooks',
          type: 'WEBHOOK_VERIFIED',
          entity: 'webhook_event',
          entityId: ev.eventId,
          payload: { eventType: ev.eventType, method: v.method, ok: v.ok, ...(v.ok ? {} : { reason: v.reason }) },
        });
      }, p.ctx.db);
      if (v.ok) {
        pass.verified++;
      } else {
        await markWebhookProcessed(p.ctx.db, ev.eventId);
        pass.rejected++;
      }
    } catch (err) {
      const failure = await recordWebhookFailure(p.ctx.db, ev.eventId, `verification: ${err instanceof Error ? err.message : String(err)}`, max);
      if (failure?.gaveUp) pass.gaveUp++;
      else pass.retrying++;
    }
  }
  return pass;
}

export interface ProcessPass {
  outcomes: WebhookOutcome[];
  retrying: number;
  gaveUp: number;
  /** Left for later because PayPal writes are switched off; not counted as a failed attempt. */
  deferred: number;
}

/**
 * Handle verified events, oldest first. The batch is claimed with FOR UPDATE SKIP LOCKED inside one transaction and each
 * event is marked processed in that same transaction, so two workers never take the same event and a crash leaves it
 * for the next pass. Handlers use the pool, not this transaction, so a PayPal call never holds a row lock of ours.
 * One bad event never stops the rest of the batch.
 *
 * No audit row is appended on `tx` while handlers are still running. appendAudit takes the chain-wide advisory lock and
 * holds it until `tx` commits; the next event's handler appends its own audit rows on another pool connection, would wait
 * on that lock, and this transaction would wait on the handler: a deadlock Postgres cannot see (one side waits in JS),
 * which would stall every audit write in the system. Give-up rows are therefore written after the last handler returns,
 * still in `tx`, so they commit atomically with the `processed_at` they explain.
 */
export async function processPendingWebhooks(p: WebhookPipeline, opts: { limit?: number } = {}): Promise<ProcessPass> {
  const max = p.maxAttempts ?? WEBHOOK_MAX_ATTEMPTS;
  return withTx(async (tx) => {
    const pass: ProcessPass = { outcomes: [], retrying: 0, gaveUp: 0, deferred: 0 };
    const gaveUp: Array<{ eventId: string; eventType: string; attempts: number; error: string }> = [];
    for (const ev of await claimVerifiedWebhooks(tx, opts.limit ?? 10)) {
      try {
        const outcome = await processWebhookEvent(p.ctx, ev);
        await markWebhookProcessed(tx, ev.eventId, outcome.action === 'IGNORED' ? `ignored: ${outcome.detail}` : undefined);
        pass.outcomes.push(outcome);
      } catch (err) {
        if (err instanceof DomainError && err.code === 'WRITES_DISABLED') {
          pass.deferred++; // the kill switch is a decision, not a failure: keep the event for when writes are back on
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        const failure = await recordWebhookFailure(tx, ev.eventId, message, max);
        if (failure?.gaveUp) {
          pass.gaveUp++;
          gaveUp.push({ eventId: ev.eventId, eventType: ev.eventType, attempts: failure.attempts, error: message.slice(0, 500) });
        } else {
          pass.retrying++;
        }
      }
    }
    // Every handler has returned: taking the audit lock on `tx` now cannot block one of them.
    for (const g of gaveUp) {
      await appendAudit(tx, {
        actor: 'system:webhook',
        type: 'WEBHOOK_GAVE_UP',
        entity: 'webhook_event',
        entityId: g.eventId,
        payload: { eventType: g.eventType, attempts: g.attempts, error: g.error },
      });
    }
    return pass;
  }, p.ctx.db);
}
