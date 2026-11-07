import { searchCatalog } from '@aegis/agents';
import { uuidv7 } from '@aegis/db';
import { describeFailure, paypalRest } from '@aegis/payments';
import type { ApiDeps } from './deps.ts';

export type ProbeName = 'db' | 'token' | 'webhook' | 'order' | 'channel3';

export interface Probe {
  name: ProbeName;
  ok: boolean;
  ms: number;
  /** PayPal's `paypal-debug-id` when the probe touched PayPal: the id support asks for. */
  debugId?: string;
  /** Why it failed, or a short fact when it passed. Never a secret. */
  detail?: string;
}

export interface SelfCheckResult {
  probes: Probe[];
  checkedAt: string;
}

/** A fast, free probe is re-run at most this often. */
const FAST_TTL_MS = 60_000;
/** A probe that creates something at PayPal or spends catalog credits is re-run at most this often. */
const SLOW_TTL_MS = 10 * 60_000;

async function timed(name: ProbeName, fn: () => Promise<Partial<Probe>>): Promise<Probe> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { name, ok: true, ms: Math.round(performance.now() - t0), ...r };
  } catch (err) {
    const f = describeFailure(err);
    return {
      name,
      ok: false,
      ms: Math.round(performance.now() - t0),
      ...(f.debugId ? { debugId: f.debugId } : {}),
      detail: f.status ? `HTTP ${f.status}: ${f.message}` : f.message,
    };
  }
}

/**
 * Live self-check (FR: "everything the demo depends on, proven right now"). Every probe talks to the real dependency: the
 * database, the PayPal sandbox token endpoint, the registered webhook, an Orders v2 AUTHORIZE create (never approved, so
 * no money can move), and the live Channel3 catalog. Results are cached so the public endpoint cannot be used to hammer
 * PayPal or burn catalog credits; concurrent callers share one in-flight run.
 */
export function createSelfCheck(d: ApiDeps): () => Promise<SelfCheckResult> {
  const slow = new Map<ProbeName, { at: number; probe: Probe }>();
  let last: { at: number; result: SelfCheckResult } | null = null;
  let inflight: Promise<SelfCheckResult> | null = null;

  const cachedSlow = async (name: ProbeName, fn: () => Promise<Partial<Probe>>): Promise<Probe> => {
    const hit = slow.get(name);
    const now = Date.now();
    if (hit && now - hit.at < SLOW_TTL_MS) return hit.probe;
    const probe = await timed(name, fn);
    slow.set(name, { at: now, probe });
    return probe;
  };

  const run = async (): Promise<SelfCheckResult> => {
    const probes = await Promise.all([
      timed('db', async () => {
        await d.db.query('select 1');
        return {};
      }),
      timed('token', async () => {
        const t = await d.ctx.vault.getToken();
        return { detail: `${t.tokenType} token held` };
      }),
      timed('webhook', async () => {
        const id = d.ctx.config.webhookId;
        if (!id) throw new Error('PAYPAL_WEBHOOK_ID is not set, so no webhook is registered');
        const r = await paypalRest<{ id: string; url: string }>(d.ctx, {
          method: 'GET',
          path: `/v1/notifications/webhooks/${encodeURIComponent(id)}`,
          action: 'get',
          subject: { type: 'selfcheck', id: uuidv7() },
          write: false,
        });
        return { ...(r.debugId ? { debugId: r.debugId } : {}), detail: 'webhook registered' };
      }),
      cachedSlow('order', async () => {
        const r = await paypalRest<{ id: string; status: string }>(d.ctx, {
          method: 'POST',
          path: '/v2/checkout/orders',
          json: {
            intent: 'AUTHORIZE',
            purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' }, description: 'AegisPay self-check (never approved)' }],
          },
          action: 'create_order',
          subject: { type: 'selfcheck', id: uuidv7() },
          write: true,
        });
        return { ...(r.debugId ? { debugId: r.debugId } : {}), detail: `AUTHORIZE order ${r.result.status}` };
      }),
      cachedSlow('channel3', async () => {
        const cfg = d.channel3;
        if (!cfg) throw new Error('no Channel3 key is configured');
        const s = await searchCatalog(cfg, { query: 'usb cable', maxPriceMinor: 5000n, limit: 1, now: new Date() });
        return { detail: `${s.products.length} product(s) from the live catalog` };
      }),
    ]);
    return { probes, checkedAt: new Date().toISOString() };
  };

  return async () => {
    if (last && Date.now() - last.at < FAST_TTL_MS) return last.result;
    inflight ??= run()
      .then((result) => {
        last = { at: Date.now(), result };
        return result;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
