import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, getFulfillment, getOrder, transition, withTx } from '@aegis/db';
import type { Db } from '@aegis/db';
import { TEST_URL } from '@aegis/db/testing';
import { CertCache, authorizeHold, createHold } from '@aegis/payments';
import { seedFulfillment, seedGatedOrder, startHarness } from '../../../packages/payments/test/harness.ts';
import type { Harness } from '../../../packages/payments/test/harness.ts';
import { QUEUE, QUEUE_DEFS, SCHEDULES } from '@aegis/jobs';
import { createWorker } from '../src/worker.ts';
import type { WorkerHandle } from '../src/worker.ts';

/**
 * The worker on a real pg-boss queue in real Postgres, running the real payment code against the PayPal contract
 * double. pg-boss keeps its own tables in a private schema that is dropped at the end.
 */
let h: Harness;
let worker: WorkerHandle;
let admin: Db;
const bossSchema = `boss_${randomBytes(5).toString('hex')}`;
const logs: Array<{ level: string; event: string; fields: Record<string, unknown> }> = [];

beforeAll(async () => {
  h = await startHarness();
  admin = createPool({ connectionString: TEST_URL, max: 1, applicationName: 'aegis-worker-test-admin' });
  worker = await createWorker({
    connectionString: TEST_URL,
    schema: bossSchema,
    pipeline: { ctx: h.ctx, certs: new CertCache(h.clock), webhookId: undefined },
    clock: h.clock,
    log: (level, event, fields = {}) => void logs.push({ level, event, fields }),
    pollingIntervalSeconds: 0.5,
    deferSeconds: 1,
  });
});
afterAll(async () => {
  await worker.stop();
  await admin.query(`drop schema if exists ${bossSchema} cascade`);
  await admin.end();
  await h.close();
});
beforeEach(() => {
  logs.length = 0;
  h.writes.enabled = true;
});

async function until<T>(what: string, fn: () => Promise<T | undefined | false>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function held() {
  const s = await seedGatedOrder(h.t);
  const { paypalOrderId } = await createHold(h.ctx, { orderRowId: s.orderId, decisionSha256: s.decisionSha, copy: { description: 'cables' }, appUrl: 'https://aegispay.example' });
  h.pp.approve(paypalOrderId);
  await authorizeHold(h.ctx, s.orderId, paypalOrderId);
  return s;
}
async function delivered() {
  const s = await held();
  await withTx((tx) => transition(tx, s.orderId, ['HELD'], 'IN_TRANSIT'), h.t.db);
  await withTx((tx) => transition(tx, s.orderId, ['IN_TRANSIT'], 'DELIVERED'), h.t.db);
  await seedFulfillment(h.t, s.orderId);
  return s;
}
const state = async (id: string) => (await getOrder(h.t.db, id))!.state;
const sendCapture = (orderId: string) => worker.boss.send(QUEUE.paymentCapture, { orderId }, { singletonKey: orderId });
const jobState = async (queue: string, id: string) => (await worker.boss.findJobs(queue, { id }))[0]?.state;

describe('worker wiring', () => {
  it('creates every queue with its policy and registers every schedule', async () => {
    const queues = await worker.boss.getQueues();
    for (const def of QUEUE_DEFS) {
      expect(queues.find((q) => q.name === def.name), def.name).toMatchObject({ policy: def.policy, retryLimit: def.retryLimit });
    }
    const schedules = await worker.boss.getSchedules();
    for (const s of SCHEDULES) {
      expect(schedules.find((x) => x.name === s.queue && x.cron === s.cron), `${s.queue} ${s.cron}`).toBeDefined();
    }
  });

  it('a capture job drives a delivered order to SETTLED, and the tracking push it queues reaches PayPal', async () => {
    const s = await delivered();
    await sendCapture(s.orderId);
    await until('order SETTLED', async () => (await state(s.orderId)) === 'SETTLED');
    await until('tracking pushed', async () => (await getFulfillment(h.t.db, s.orderId))?.pushedToPaypalAt);
    const { rows } = await h.t.db.query<{ type: string }>(`select type from audit_event where entity_id = $1 order by seq`, [s.orderId]);
    expect(rows.map((r) => r.type)).toEqual(expect.arrayContaining(['CAPTURED', 'TRACKING_PUSHED']));
  });

  it('completes (does not retry) a job that can never succeed, and leaves the order untouched', async () => {
    const s = await held(); // HELD, not DELIVERED: capture is refused by the proof gate
    const id = (await sendCapture(s.orderId))!;
    await until('job rejected', async () => logs.find((l) => l.event === 'job.rejected' && l.fields.jobId === id));
    await until('job completed', async () => (await jobState(QUEUE.paymentCapture, id)) === 'completed');
    expect(await state(s.orderId)).toBe('HELD');
    expect(logs.some((l) => l.event === 'job.failed' && l.fields.jobId === id)).toBe(false);
  });

  it('completes a job with a malformed payload instead of retrying it three times', async () => {
    const id = (await worker.boss.send(QUEUE.paymentCapture, { orderId: 'not-a-uuid' }))!;
    await until('job rejected', async () => logs.find((l) => l.event === 'job.rejected' && l.fields.jobId === id));
    await until('job completed', async () => (await jobState(QUEUE.paymentCapture, id)) === 'completed');
  });

  it('a capture held back by the kill switch waits, then goes through once writes are back on', async () => {
    const s = await delivered();
    h.writes.enabled = false;
    h.pp.seen.length = 0;
    const id = (await sendCapture(s.orderId))!;
    await until('job deferred', async () => logs.find((l) => l.event === 'job.deferred' && l.fields.jobId === id));
    expect(await state(s.orderId)).toBe('DELIVERED');
    expect(h.pp.seen.some((c) => c.method === 'POST' && c.path.includes('/capture'))).toBe(false);

    h.writes.enabled = true; // the deferred copy is queued again after deferSeconds
    await until('order SETTLED', async () => (await state(s.orderId)) === 'SETTLED');
    expect(await jobState(QUEUE.paymentCapture, id)).toBe('completed'); // the deferral was not a failure
  });
});
