import { z } from 'zod';
import { QUEUE } from './queues.ts';

const Uuid = z.string().uuid();

/**
 * What each queue accepts. The API validates by sending through `createJobSender`; the worker parses the same schemas
 * on receipt, so a payload one side can build is a payload the other side accepts.
 */
export const PAYLOAD = {
  [QUEUE.webhookProcess]: z.object({ eventId: z.string().optional() }),
  [QUEUE.paymentCapture]: z.object({ orderId: Uuid }),
  [QUEUE.paymentVoid]: z.object({ orderId: Uuid, reason: z.enum(['SLA_BREACH', 'CANCEL']), confirmedBy: z.string().min(1).optional() }),
  [QUEUE.trackingPush]: z.object({ orderId: Uuid, captureId: z.string().min(1) }),
} as const;

export type VoidJob = z.infer<(typeof PAYLOAD)[typeof QUEUE.paymentVoid]>;

/** Singleton keys. One definition, so the API and the worker can never disagree about what counts as a duplicate. */
export const jobKey = {
  webhook: (eventId: string) => eventId,
  order: (orderId: string) => orderId,
};
