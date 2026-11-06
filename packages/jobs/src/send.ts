import type { PgBoss } from 'pg-boss';
import { PAYLOAD, jobKey } from './payloads.ts';
import type { VoidJob } from './payloads.ts';
import { QUEUE, QUEUE_DEFS } from './queues.ts';

/** Create every queue if it is missing. pg-boss refuses to send to a queue that does not exist, and either process may start first. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const q of QUEUE_DEFS) {
    const { name, ...opts } = q;
    await boss.createQueue(name, opts);
  }
}

/** Anything that can run SQL inside an open transaction: a pg client from `withTx` fits. */
export interface TxExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * The only jobs the API ever queues. Capture is here because delivery enqueues it; it is still the worker that runs the
 * proof gate and the PayPal call. Each method validates its payload with the schema the worker will parse.
 *
 * Pass `tx` to insert the job in the SAME transaction as the state change that calls for it (a transactional outbox):
 * either both commit or neither does, so a crash can never leave an order DELIVERED with no capture job, or a stored
 * webhook with no sweep queued. Without `tx` the job is inserted on its own.
 */
export interface JobSender {
  webhookProcess(eventId: string, tx?: TxExecutor): Promise<void>;
  capture(orderId: string, tx?: TxExecutor): Promise<void>;
  void(orderId: string, input: Pick<VoidJob, 'reason' | 'confirmedBy'>, tx?: TxExecutor): Promise<void>;
}

const via = (tx?: TxExecutor) => (tx ? { db: { executeSql: (text: string, values?: unknown[]) => tx.query(text, values) } } : {});

export function createJobSender(boss: PgBoss): JobSender {
  return {
    async webhookProcess(eventId, tx) {
      await boss.send(QUEUE.webhookProcess, PAYLOAD[QUEUE.webhookProcess].parse({ eventId }), { singletonKey: jobKey.webhook(eventId), ...via(tx) });
    },
    async capture(orderId, tx) {
      await boss.send(QUEUE.paymentCapture, PAYLOAD[QUEUE.paymentCapture].parse({ orderId }), { singletonKey: jobKey.order(orderId), ...via(tx) });
    },
    async void(orderId, input, tx) {
      await boss.send(QUEUE.paymentVoid, PAYLOAD[QUEUE.paymentVoid].parse({ orderId, ...input }), { singletonKey: jobKey.order(orderId), ...via(tx) });
    },
  };
}
