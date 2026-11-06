import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import { z } from 'zod';
import type { Clock } from '@aegis/core';
import type { WebhookFollowUp, WebhookPipeline } from '@aegis/payments';
import {
  classifyFailure,
  runCapture,
  runPollOpen,
  runReauthSweep,
  runRefundReconcile,
  runSlaWatch,
  runTrackingPush,
  runVoid,
  runWebhookSweep,
} from './jobs.ts';
import type { WorkerDeps } from './jobs.ts';
import { QUEUE, QUEUE_DEFS, SCHEDULES } from './queues.ts';
import type { QueueName } from './queues.ts';

export type Log = (level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) => void;

/** One JSON line per event. Fields are chosen by callers and never include credentials or tokens. */
export const jsonLog: Log = (level, event, fields = {}) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  (level === 'error' ? console.error : console.log)(line);
};

export interface WorkerOptions {
  connectionString: string;
  /** pg-boss's own schema. Tests give each run a private one. */
  schema?: string;
  pipeline: WebhookPipeline;
  clock: Clock;
  log?: Log;
  /** Seconds between polls of an empty queue. The default is fine for production; tests lower it. */
  pollingIntervalSeconds?: number;
  /** How long a job held back by the kill switch waits before it is queued again. */
  deferSeconds?: number;
}

export interface WorkerHandle {
  boss: PgBoss;
  deps: WorkerDeps;
  stop(): Promise<void>;
}

const Uuid = z.string().uuid();
const Schemas = {
  [QUEUE.webhookProcess]: z.object({ eventId: z.string().optional() }),
  [QUEUE.paymentCapture]: z.object({ orderId: Uuid }),
  [QUEUE.paymentVoid]: z.object({ orderId: Uuid, reason: z.enum(['SLA_BREACH', 'CANCEL']), confirmedBy: z.string().min(1).optional() }),
  [QUEUE.trackingPush]: z.object({ orderId: Uuid, captureId: z.string().min(1) }),
} as const;

/** Send helpers the API and the worker share, so the singleton keys cannot drift apart. */
export const jobKey = {
  webhook: (eventId: string) => eventId,
  order: (orderId: string) => orderId,
};

export async function createWorker(o: WorkerOptions): Promise<WorkerHandle> {
  const log = o.log ?? jsonLog;
  const boss = new PgBoss({
    connectionString: o.connectionString,
    ...(o.schema ? { schema: o.schema } : {}),
    application_name: 'aegispay-worker',
    max: 4,
  });
  boss.on('error', (err: Error) => log('error', 'boss.error', { message: err.message }));
  await boss.start();

  const deps: WorkerDeps = {
    pipeline: o.pipeline,
    clock: o.clock,
    enqueue: async (job: WebhookFollowUp) => {
      await boss.send(QUEUE.trackingPush, { orderId: job.orderId, captureId: job.captureId }, { singletonKey: jobKey.order(job.orderId) });
    },
  };

  for (const q of QUEUE_DEFS) {
    const { name, ...opts } = q;
    await boss.createQueue(name, opts);
  }

  const poll = o.pollingIntervalSeconds !== undefined ? { pollingIntervalSeconds: o.pollingIntervalSeconds } : {};
  const deferMs = (o.deferSeconds ?? 60) * 1000;

  /**
   * Run one job and decide what its failure means (see classifyFailure). A permanent failure completes the job: the
   * audit log already holds the reason and another attempt would only repeat it. A job held back by the kill switch is
   * queued again later rather than burning a retry. Everything else throws, so pg-boss retries it with backoff.
   */
  const register = async <D extends object>(name: QueueName, run: (data: D) => Promise<unknown>, key?: (data: D) => string) => {
    await boss.work<D>(name, { ...poll, batchSize: 1 }, async (jobs: Job<D>[]) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          const result = await run(job.data);
          log('info', 'job.done', { queue: name, jobId: job.id, ms: Date.now() - started, ...(result && typeof result === 'object' ? { result } : {}) });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const kind = classifyFailure(err);
          if (kind === 'deferred') {
            await boss.send(name, job.data, { startAfter: new Date(Date.now() + deferMs), ...(key ? { singletonKey: key(job.data) } : {}) });
            log('warn', 'job.deferred', { queue: name, jobId: job.id, reason: 'PAYPAL_WRITES_ENABLED is off' });
          } else if (kind === 'permanent') {
            log('warn', 'job.rejected', { queue: name, jobId: job.id, message });
          } else {
            log('error', 'job.failed', { queue: name, jobId: job.id, retryCount: job.retryCount, message });
            throw err;
          }
        }
      }
    });
  };

  await register(QUEUE.webhookProcess, async (data) => {
    Schemas[QUEUE.webhookProcess].parse(data ?? {}); // the cron safety-net sends no payload
    return runWebhookSweep(deps);
  });
  await register(QUEUE.paymentCapture, (data) => runCapture(deps, Schemas[QUEUE.paymentCapture].parse(data).orderId), (d: { orderId: string }) => jobKey.order(d.orderId));
  await register(
    QUEUE.paymentVoid,
    (data) => {
      const v = Schemas[QUEUE.paymentVoid].parse(data);
      return runVoid(deps, v.orderId, { reason: v.reason, ...(v.confirmedBy ? { confirmedBy: v.confirmedBy } : {}) });
    },
    (d: { orderId: string }) => jobKey.order(d.orderId),
  );
  await register(
    QUEUE.trackingPush,
    (data) => {
      const v = Schemas[QUEUE.trackingPush].parse(data);
      return runTrackingPush(deps, v.orderId, v.captureId);
    },
    (d: { orderId: string }) => jobKey.order(d.orderId),
  );
  await register(QUEUE.slaWatch, async () => ({ flagged: await runSlaWatch(deps) }));
  await register(QUEUE.pollOpen, (): Promise<object> => runPollOpen(deps));
  await register(QUEUE.paymentReauth, (): Promise<object> => runReauthSweep(deps));
  await register(QUEUE.refundReconcile, async () => {
    const r = await runRefundReconcile(deps);
    return { changed: r.changed.length, errors: r.errors.length };
  });

  for (const s of SCHEDULES) await boss.schedule(s.queue, s.cron);

  log('info', 'worker.started', { queues: QUEUE_DEFS.map((q) => q.name), schedules: SCHEDULES.length });
  return {
    boss,
    deps,
    async stop() {
      await boss.stop({ graceful: true, timeout: 20_000 });
      log('info', 'worker.stopped');
    },
  };
}
