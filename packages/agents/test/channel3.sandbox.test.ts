import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { channel3FromEnv, searchCatalog, shortlist } from '../src/index.ts';

/**
 * LIVE contract check of the Channel3 client against the real catalog API (CHANNEL3_API_KEY in the gitignored .env).
 * Run with `pnpm test:sandbox`. Reads only; one search per test. Asserts the parts of the response our code depends on.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const cfg = channel3FromEnv({ CHANNEL3_API_KEY: process.env.CHANNEL3_API_KEY });
const live = cfg ? describe : describe.skip;

live('Channel3 live search', () => {
  it('returns products whose offers parse to exact minor units within the requested ceiling', async () => {
    const s = await searchCatalog(cfg!, { query: 'stainless steel water bottle', maxPriceMinor: 3000n, limit: 5, now: new Date() });
    expect(s.products.length).toBeGreaterThan(0);
    const offers = s.products.flatMap((p) => p.offers);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(typeof o.priceMinor).toBe('bigint');
      expect(o.domain.length).toBeGreaterThan(2);
      expect(o.url).toMatch(/^https?:\/\//);
    }
    // The filter is Channel3's; we only check that a cheap-enough offer exists, not that every offer obeys it.
    expect(offers.some((o) => o.currency === 'USD' && o.priceMinor <= 3000n)).toBe(true);
  });

  it('builds a ranked shortlist with gate-ready snapshots from the live response', async () => {
    const s = await searchCatalog(cfg!, { query: 'stainless steel water bottle', maxPriceMinor: 3000n, limit: 5, now: new Date() });
    const r = await shortlist(s, { spec: { keywords: ['stainless steel water bottle'] }, quantity: 4, unitCeiling: 3000n }, { model: null });
    expect(r.candidates.length).toBeGreaterThan(0);
    const prices = r.candidates.filter((c) => c.inStock).map((c) => c.unitPriceMinor);
    expect([...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(prices); // cheapest first among in-stock
    for (const c of r.candidates) {
      expect(c.snapshot).toMatchObject({ source: 'channel3', productId: c.productId, title: c.title });
      expect(c.rationale.length).toBeGreaterThan(10);
    }
  });

  it('is rejected cleanly with a wrong key and never echoes it', async () => {
    const err = await searchCatalog({ ...cfg!, apiKey: 'definitely-not-a-key' }, { query: 'bottle', maxPriceMinor: 1000n, now: new Date() }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'AGENT_UNAVAILABLE' });
    expect(String((err as Error).message)).not.toContain('definitely-not-a-key');
  });
});
