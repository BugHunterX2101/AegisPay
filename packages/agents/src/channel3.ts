import { DomainError, usd } from '@aegis/core';
import { z } from 'zod';

export const CHANNEL3_BASE_URL = 'https://api.trychannel3.com';

export interface Channel3Config {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';

/** Where requests may go: Channel3's production host, or a loopback address (the local contract server in tests). Nothing else. */
export function assertChannel3Url(baseUrl: string): string {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new DomainError('INTERNAL', `CHANNEL3_BASE_URL is not a URL: ${baseUrl}`);
  }
  const ok = (u.protocol === 'https:' && u.host === 'api.trychannel3.com') || (u.protocol === 'http:' && isLoopback(u.hostname));
  if (!ok) throw new DomainError('INTERNAL', `Refusing Channel3 base URL ${u.origin}: only api.trychannel3.com or loopback is allowed`);
  return u.origin;
}

/** No key means no catalog: sourcing then reports that it cannot run, rather than inventing products. */
export function channel3FromEnv(env: Record<string, string | undefined> = process.env): Channel3Config | null {
  const apiKey = env.CHANNEL3_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = assertChannel3Url(env.CHANNEL3_BASE_URL?.trim() || CHANNEL3_BASE_URL);
  return { apiKey, baseUrl };
}

/* ---- What Channel3 returns (fields as published in its OpenAPI: ProductOffer, Price, ProductRatings) ---- */

const OfferSchema = z.looseObject({
  url: z.string().min(1),
  domain: z.string().min(1),
  price: z.looseObject({ price: z.number().nonnegative().finite(), currency: z.string().min(3).max(3) }),
  availability: z.string(),
  condition: z.string().nullish(),
});

const ProductSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().min(1),
  key_features: z.array(z.string()).nullish(),
  ratings: z.looseObject({ value: z.number().min(0).max(5), count: z.number().nullish() }).nullish(),
  offers: z.array(z.unknown()).default([]),
});

const ResponseSchema = z.looseObject({ products: z.array(z.unknown()) });

export interface CatalogOffer {
  url: string;
  domain: string;
  priceMinor: bigint;
  currency: string;
  inStock: boolean;
  condition: string | null;
  /** The offer exactly as Channel3 returned it. */
  raw: unknown;
}

export interface CatalogProduct {
  id: string;
  title: string;
  features: string[];
  rating: number | null;
  ratingCount: number | null;
  offers: CatalogOffer[];
  /** The product exactly as Channel3 returned it, stored as the dispute-evidence snapshot. */
  raw: unknown;
}

export interface CatalogSearch {
  requestBody: unknown;
  products: CatalogProduct[];
  /** Products or offers that did not match the published shape and were left out rather than guessed at. */
  skipped: number;
  fetchedAt: Date;
}

export interface SearchParams {
  query: string;
  /** Per-unit ceiling. Sent as `filters.price.max_price` in dollars. */
  maxPriceMinor: bigint;
  limit?: number;
  now: Date;
}

/** "12.99" dollars -> 1299n. Channel3 sends prices as JSON numbers; two decimals are kept, never more. */
const priceToMinor = (p: number): bigint => usd.parse(p.toFixed(2));

/**
 * POST /v1/search. Body per Channel3's API reference: query, limit, filters.price.max_price (dollars),
 * filters.availability and filters.conditions. A real HTTP call: no fixtures in production code.
 */
export async function searchCatalog(cfg: Channel3Config, p: SearchParams): Promise<CatalogSearch> {
  const base = assertChannel3Url(cfg.baseUrl ?? CHANNEL3_BASE_URL);
  const body = {
    query: p.query,
    limit: Math.min(Math.max(p.limit ?? 10, 1), 30),
    filters: {
      price: { max_price: Number(usd.toPayPal(p.maxPriceMinor)) },
      availability: ['InStock'],
      conditions: ['new'],
    },
    config: { mode: 'default' },
  };

  const doFetch = cfg.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${base}/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': cfg.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
    });
  } catch (err) {
    throw new DomainError('AGENT_UNAVAILABLE', `Could not reach the product catalog: ${err instanceof Error ? err.message : 'network error'}`);
  }

  if (!res.ok) {
    const why =
      res.status === 401 || res.status === 403
        ? 'the catalog rejected the API key'
        : res.status === 402
          ? 'the catalog account is out of credits'
          : res.status === 429
            ? 'the catalog is rate limiting requests'
            : `the catalog answered HTTP ${res.status}`;
    throw new DomainError('AGENT_UNAVAILABLE', `Product search failed: ${why}`, { details: { status: res.status } });
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new DomainError('AGENT_UNAVAILABLE', 'Product search failed: the catalog returned something that is not JSON');
  }
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) throw new DomainError('AGENT_UNAVAILABLE', 'Product search failed: the catalog response has no products list');

  let skipped = 0;
  const products: CatalogProduct[] = [];
  for (const rawProduct of parsed.data.products) {
    const prod = ProductSchema.safeParse(rawProduct);
    if (!prod.success) {
      skipped++;
      continue;
    }
    const offers: CatalogOffer[] = [];
    for (const rawOffer of prod.data.offers) {
      const o = OfferSchema.safeParse(rawOffer);
      if (!o.success) {
        skipped++;
        continue;
      }
      offers.push({
        url: o.data.url,
        domain: o.data.domain,
        priceMinor: priceToMinor(o.data.price.price),
        currency: o.data.price.currency.toUpperCase(),
        inStock: o.data.availability === 'InStock',
        condition: o.data.condition ?? null,
        raw: rawOffer,
      });
    }
    products.push({
      id: prod.data.id,
      title: prod.data.title,
      features: (prod.data.key_features ?? []).map((f) => f.trim()).filter(Boolean),
      rating: prod.data.ratings ? prod.data.ratings.value : null,
      ratingCount: prod.data.ratings?.count ?? null,
      offers,
      raw: rawProduct,
    });
  }
  return { requestBody: body, products, skipped, fetchedAt: p.now };
}
