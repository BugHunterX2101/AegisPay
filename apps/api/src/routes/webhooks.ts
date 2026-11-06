import { recordWebhookEvent, withTx } from '@aegis/db';
import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../deps.ts';

/** PayPal events are a few KB. The limit is the flood guard (TDD "Denial of service"). */
export const WEBHOOK_MAX_BYTES = 1024 * 1024;

/**
 * POST /webhooks/paypal. The listener does the minimum and does it durably:
 *  1. keep the EXACT bytes received (the signature is over them; re-serialised JSON can fail verification),
 *  2. store them under PayPal's event id (a redelivery is a no-op),
 *  3. nudge the worker, which verifies the signature and only then acts.
 *
 * It answers 200 for everything PayPal could have sent, so a bad payload of ours never makes PayPal retry for days.
 * The one exception is a failure to STORE the event: acknowledging an event we did not keep would lose it, so that is a
 * 500 and PayPal redelivers. Failing to QUEUE the nudge is not fatal: the stored event is swept every minute.
 */
export function registerWebhooks(app: FastifyInstance, d: ApiDeps): void {
  void app.register(async (scope) => {
    // Own parser, in this scope only: hand the raw bytes through untouched and never fail on malformed JSON.
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: WEBHOOK_MAX_BYTES }, (_req, body, done) => done(null, body));

    scope.post('/webhooks/paypal', { bodyLimit: WEBHOOK_MAX_BYTES, config: { rateLimit: false } }, async (req, reply) => {
      const raw = req.body as Buffer;
      let eventId: string | undefined;
      let eventType: string | undefined;
      try {
        const j = JSON.parse(raw.toString('utf8')) as { id?: unknown; event_type?: unknown };
        if (typeof j.id === 'string' && j.id.length > 0 && j.id.length <= 128) eventId = j.id;
        if (typeof j.event_type === 'string' && j.event_type.length > 0 && j.event_type.length <= 128) eventType = j.event_type;
      } catch {
        /* not JSON: handled below */
      }
      if (!eventId || !eventType) {
        req.log.warn({ bytes: raw.length }, 'webhook without an event id or type ignored');
        return reply.code(200).send({ received: false });
      }

      const { inserted } = await withTx((tx) => recordWebhookEvent(tx, { eventId, eventType, rawBody: raw, headers: req.headers }), d.db);

      try {
        await d.jobs.webhookProcess(eventId); // singleton per event id, so a redelivery does not queue a second job
      } catch (err) {
        req.log.error({ err, eventId }, 'webhook stored but not queued; the minute sweep will pick it up');
      }
      return reply.code(200).send({ received: true, duplicate: !inserted });
    });
  });
}
