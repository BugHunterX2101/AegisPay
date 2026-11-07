import { DAY_MS, DemoClockBody, DomainError } from '@aegis/core';
import { appendAudit, getClockOffsetMs, resetDemo, setClockOffsetMs, withTx } from '@aegis/db';
import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../deps.ts';

/**
 * Judge Mode controls. The clock offset moves only the app's own "now" (SLA timers, auto-void), never PayPal's: a judge
 * can fast-forward past the delivery SLA and watch the breach flow run for real. The offset lives in the database so the
 * API and the worker, which are separate processes, agree on it. Both writes are refused unless Judge Mode is on.
 */
export function registerDemoRoutes(app: FastifyInstance, d: ApiDeps, o: { judgeMode: boolean }): void {
  const guard = () => {
    if (!o.judgeMode || !d.demoClock) throw new DomainError('FORBIDDEN', 'Judge Mode is off: the demo clock and reset are disabled');
  };

  app.get('/api/demo/clock', async () => {
    const ms = await getClockOffsetMs(d.db);
    return { offsetDays: Math.round(ms / DAY_MS), now: d.clock.now().toISOString(), judgeMode: o.judgeMode };
  });

  app.post('/api/demo/clock', async (req) => {
    guard();
    const { offsetDays } = DemoClockBody.parse(req.body);
    const ms = offsetDays * DAY_MS;
    await withTx(async (tx) => {
      await setClockOffsetMs(tx, ms);
      await appendAudit(tx, { actor: req.actor, type: 'DEMO_CLOCK_SET', entity: 'system', entityId: 'demo', payload: { offsetDays } });
    }, d.db);
    d.demoClock!.setOffset(ms); // this process now; the worker's watcher picks the stored value up within its poll interval
    return { offsetDays, now: d.clock.now().toISOString() };
  });

  app.post('/api/demo/reset', async (req) => {
    guard();
    const deleted = await resetDemo(d.db, req.actor);
    d.demoClock!.setOffset(0);
    return { ok: true, deleted };
  });
}
