import type { PayPalContext } from '../client.ts';
import { isSimulatedEvent } from './simulate.ts';
import { verifyOffline } from './verify-offline.ts';
import type { CertCache } from './verify-offline.ts';
import { verifyPostback } from './verify-postback.ts';

export type Verification = { method: 'POSTBACK' | 'OFFLINE'; ok: true } | { method: 'FAILED'; ok: false; reason: string; attempted: 'POSTBACK' | 'OFFLINE' };

export interface VerifyEventInput {
  eventId: string;
  raw: Buffer;
  headers: Record<string, string | string[] | undefined>;
  webhookId: string;
  certs: CertCache;
}

/**
 * TDD "Webhook verification algorithm" steps 2–4. An event whose id came back from our own simulate-event call is
 * verified offline (postback is unsupported for mock events); every other event is verified by PayPal itself.
 * Fails closed: a missing webhook id, a bad signature or an unlisted simulated id all end in FAILED, and the caller
 * takes no state action on FAILED. A transport failure to PayPal throws so the job retries instead of failing the event.
 */
export async function verifyWebhookEvent(ctx: PayPalContext, i: VerifyEventInput): Promise<Verification> {
  const offline = await isSimulatedEvent(ctx.db, i.eventId);
  if (offline) {
    const r = await verifyOffline({ raw: i.raw, headers: i.headers, webhookId: i.webhookId, certs: i.certs, clock: ctx.clock });
    return r.ok ? { method: 'OFFLINE', ok: true } : { method: 'FAILED', ok: false, reason: r.reason, attempted: 'OFFLINE' };
  }
  const r = await verifyPostback(ctx, { eventId: i.eventId, raw: i.raw, headers: i.headers, webhookId: i.webhookId });
  return r.ok ? { method: 'POSTBACK', ok: true } : { method: 'FAILED', ok: false, reason: r.reason, attempted: 'POSTBACK' };
}
