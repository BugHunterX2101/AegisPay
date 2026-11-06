import { DomainError } from '@aegis/core';
import { appendAudit, uuidv7, withTx } from '@aegis/db';
import type { Queryable } from '@aegis/db';
import type { PayPalContext } from '../client.ts';
import { paypalRest } from '../rest.ts';

/**
 * Asks PayPal's webhook simulator to deliver a mock event to our registered webhook, and records the event id it
 * returns as a WEBHOOK_SIMULATED audit event. Postback verification does not work for mock events, so the worker
 * looks the id up (isSimulatedEvent) to choose offline verification. Recording in the hash-chained audit log means
 * the list cannot be quietly edited to downgrade a real event to the weaker path.
 */
export async function simulateEvent(ctx: PayPalContext, i: { webhookId: string; eventType: string }): Promise<{ eventId: string }> {
  if (!i.webhookId) throw new DomainError('VALIDATION', 'webhookId is required to simulate an event');
  if (!/^[A-Z]+(\.[A-Z_]+)+$/.test(i.eventType)) throw new DomainError('VALIDATION', `"${i.eventType}" is not a PayPal event type`);
  const res = await paypalRest<{ id?: string }>(ctx, {
    method: 'POST',
    path: '/v1/notifications/simulate-event',
    json: { webhook_id: i.webhookId, event_type: i.eventType },
    action: 'simulate_event',
    subject: { type: 'webhook_simulation', id: uuidv7() },
    write: true,
  });
  const eventId = res.result?.id;
  if (!eventId) {
    throw new DomainError('PAYPAL_ERROR', 'simulate-event answered without an event id; the event cannot be tracked as simulated', {
      ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
    });
  }
  await withTx(
    (tx) =>
      appendAudit(tx, {
        actor: 'system:payments',
        type: 'WEBHOOK_SIMULATED',
        entity: 'webhook_event',
        entityId: eventId,
        ...(res.debugId ? { paypalDebugId: res.debugId } : {}),
        payload: { eventType: i.eventType },
      }),
    ctx.db,
  );
  return { eventId };
}

/** True if this event id came back from our own simulate-event call. */
export async function isSimulatedEvent(db: Queryable, eventId: string): Promise<boolean> {
  const r = await db.query(`select 1 from audit_event where type = 'WEBHOOK_SIMULATED' and entity = 'webhook_event' and entity_id = $1 limit 1`, [eventId]);
  return r.rows.length > 0;
}
