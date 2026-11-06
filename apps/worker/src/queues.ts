import type { Queue } from 'pg-boss';

/**
 * Queue names and per-queue retry policy (Technical Documentation, "Worker queues").
 *
 * Policies, from pg-boss: `short` keeps one *queued* job per singletonKey (a burst of identical requests collapses);
 * `stately` keeps one job per state per singletonKey (one queued plus one active, so an order's money calls never
 * overlap); `exclusive` keeps one job queued *or active* (a scheduled sweep never runs on top of itself).
 *
 * `dispute.sync` and `dispute.submit` are not here yet. The webhook processor syncs a dispute inline, `poll.open`
 * re-fetches open disputes, and submitting evidence needs a human click, so it arrives with the API route.
 */
export const QUEUE = {
  webhookProcess: 'webhook.process',
  paymentCapture: 'payment.capture',
  paymentVoid: 'payment.void',
  trackingPush: 'tracking.push',
  slaWatch: 'sla.watch',
  pollOpen: 'poll.open',
  paymentReauth: 'payment.reauth',
  refundReconcile: 'refund.reconcile',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const QUEUE_DEFS: ReadonlyArray<Queue> = [
  // One job per event id; PayPal retries a delivery, and the listener enqueues on every accepted one.
  { name: QUEUE.webhookProcess, policy: 'short', retryLimit: 3, retryDelay: 5, retryBackoff: true, expireInSeconds: 120 },
  // Capture and void move money: per order, one queued and one active at most (`stately`), same PayPal-Request-Id on
  // every retry (set by payments). `stately` rather than `exclusive` so a job held back by the kill switch can
  // re-queue itself while it is still the active one.
  { name: QUEUE.paymentCapture, policy: 'stately', retryLimit: 3, retryDelay: 5, retryBackoff: true, expireInSeconds: 120 },
  { name: QUEUE.paymentVoid, policy: 'stately', retryLimit: 3, retryDelay: 5, retryBackoff: true, expireInSeconds: 120 },
  { name: QUEUE.trackingPush, policy: 'stately', retryLimit: 3, retryDelay: 10, retryBackoff: true, expireInSeconds: 120 },
  // Schedules: never overlap themselves, never retry (the next tick is the retry).
  { name: QUEUE.slaWatch, policy: 'exclusive', retryLimit: 0, expireInSeconds: 60 },
  { name: QUEUE.pollOpen, policy: 'exclusive', retryLimit: 0, expireInSeconds: 110 },
  { name: QUEUE.paymentReauth, policy: 'exclusive', retryLimit: 0, expireInSeconds: 300 },
  { name: QUEUE.refundReconcile, policy: 'exclusive', retryLimit: 0, expireInSeconds: 110 },
];

/** pg-boss cron (5-field, UTC). Spec: sla.watch every minute, poll.open every 2 minutes, reauth every 15. */
export const SCHEDULES: ReadonlyArray<{ queue: QueueName; cron: string }> = [
  { queue: QUEUE.slaWatch, cron: '* * * * *' },
  { queue: QUEUE.pollOpen, cron: '*/2 * * * *' },
  { queue: QUEUE.paymentReauth, cron: '*/15 * * * *' },
  { queue: QUEUE.refundReconcile, cron: '*/5 * * * *' },
  // Safety net: the listener enqueues a sweep per event, this catches anything that arrived while the worker was down.
  { queue: QUEUE.webhookProcess, cron: '* * * * *' },
];
