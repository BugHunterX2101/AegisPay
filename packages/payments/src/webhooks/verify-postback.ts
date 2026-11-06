import { DomainError } from '@aegis/core';
import type { PayPalContext } from '../client.ts';
import { paypalRest } from '../rest.ts';
import { checkCertUrl, parseWebhookHeaders } from './verify-offline.ts';
import type { OfflineResult } from './verify-offline.ts';

export interface PostbackInput {
  eventId: string;
  raw: Buffer;
  headers: Record<string, string | string[] | undefined>;
  webhookId: string;
}

/**
 * Live verification (TDD step 3): ask PayPal itself with `POST /v1/notifications/verify-webhook-signature`.
 *
 * The event must be posted exactly as received, since PayPal's signature covers the original bytes and re-serialised
 * JSON can fail. So the request body is assembled as text and the raw event text is spliced in verbatim as
 * `webhook_event`; it is never parsed and re-stringified. Only `SUCCESS` counts. A transport/API failure throws
 * (the worker retries); a definite FAILURE answer returns `{ ok: false }`.
 */
export async function verifyPostback(ctx: PayPalContext, i: PostbackInput): Promise<OfflineResult> {
  const parsed = parseWebhookHeaders(i.headers);
  if (!parsed.ok) return parsed;
  const h = parsed.headers;
  if (!i.webhookId) return { ok: false, reason: 'WEBHOOK_ID_NOT_CONFIGURED' };
  if (!checkCertUrl(h.certUrl)) return { ok: false, reason: 'CERT_URL_REJECTED' };

  const text = i.raw.toString('utf8');
  try {
    JSON.parse(text);
  } catch {
    return { ok: false, reason: 'BODY_NOT_JSON' };
  }
  const j = JSON.stringify;
  const rawBody =
    `{"auth_algo":${j(h.authAlgo)},"cert_url":${j(h.certUrl)},"transmission_id":${j(h.transmissionId)},` +
    `"transmission_sig":${j(h.transmissionSig)},"transmission_time":${j(h.transmissionTime)},` +
    `"webhook_id":${j(i.webhookId)},"webhook_event":${text}}`;

  const res = await paypalRest<{ verification_status?: string }>(ctx, {
    method: 'POST',
    path: '/v1/notifications/verify-webhook-signature',
    rawBody,
    action: 'verify_webhook',
    subject: { type: 'webhook_event', id: i.eventId },
    write: false, // verification changes nothing at PayPal, so it must work even with the kill switch off
  });
  const status = res.result?.verification_status;
  if (status === 'SUCCESS') return { ok: true };
  if (status === 'FAILURE') return { ok: false, reason: 'VERIFICATION_STATUS: FAILURE' };
  throw new DomainError('PAYPAL_ERROR', `verify-webhook-signature returned an unexpected status ${String(status)}`, {
    ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
  });
}
