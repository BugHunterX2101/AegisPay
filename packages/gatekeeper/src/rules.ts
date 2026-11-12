import type { Context, Mandate, Proposal, RuleResult } from './types.ts';

/** PayPal authorization validity window (days). Rule R8 keeps every hold inside it. */
export const AUTH_VALIDITY_DAYS = 29;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD → UTC ms, or NaN. Rejects 2026-02-31 style overflow. */
export function dateMs(s: string): number {
  const m = DATE_RE.exec(s);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d
    ? t
    : NaN;
}

/** ISO datetime (must carry a zone) → ms, or NaN. */
export function instantMs(s: string): number {
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return NaN;
  return Date.parse(s);
}

const isPosInt = (n: number): boolean => Number.isSafeInteger(n) && n >= 1;

export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive whole-word (unicode letter/digit boundaries) containment. */
export function hasWholeWord(haystack: string, term: string): boolean {
  const t = term.trim();
  if (t === '') return false;
  // Sellers write "USB-C", "USB C" and "USB – C" for the same thing: a space or dash inside a term matches any run of
  // spaces and dashes in the title. Letters and digits still have to match exactly, so "USBC" is not "USB-C".
  const body = t.split(/[\s\-‐‑–—]+/u).map(escapeRe).join('[\\s\\-‐‑–—]+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu');
  return re.test(haystack);
}

export type Rule = (m: Mandate, p: Proposal, c: Context) => RuleResult;

const r = (
  id: RuleResult['id'],
  label: string,
  pass: boolean,
  expected: string,
  actual: string,
): RuleResult => ({ id, pass, label, expected, actual });

export const R1: Rule = (m, _p, c) => {
  const now = instantMs(c.now);
  const exp = instantMs(m.expiresAt);
  const valid = Number.isFinite(now) && Number.isFinite(exp);
  const pass = m.status === 'ACTIVE' && valid && now <= exp;
  return r(
    'R1',
    'Mandate active and not expired',
    pass,
    `status ACTIVE and now <= ${m.expiresAt}`,
    valid ? `status ${m.status}, now ${c.now}` : `unparseable time (now ${c.now}, expiresAt ${m.expiresAt})`,
  );
};

export const R2: Rule = (m, p) =>
  r(
    'R2',
    'Proposal targets current mandate version',
    p.mandateId === m.id && p.mandateVersion === m.version,
    `mandate ${m.id} v${m.version}`,
    `mandate ${p.mandateId} v${p.mandateVersion}`,
  );

export const R3: Rule = (m, p) =>
  r(
    'R3',
    'Unit price within ceiling',
    p.unitPrice >= 0n && p.unitPrice <= m.unitCeiling,
    `0 <= ${m.unitCeiling}`,
    `${p.unitPrice}`,
  );

export const R4: Rule = (m, p) =>
  r('R4', 'Currency matches', p.currency === m.currency, m.currency, p.currency);

export const R5: Rule = (m, p) =>
  r('R5', 'Quantity matches', p.quantity === m.quantity, `${m.quantity}`, `${p.quantity}`);

/** Total in minor units, or null when an input cannot be priced (bad quantity / negative money). */
export function computeTotal(p: Proposal): bigint | null {
  if (!isPosInt(p.quantity) || p.unitPrice < 0n || p.shipping < 0n || p.tax < 0n) return null;
  return p.unitPrice * BigInt(p.quantity) + p.shipping + p.tax;
}

export const R6: Rule = (m, p, c) => {
  const total = computeTotal(p);
  const remaining = m.budget - c.spentSoFar;
  return r(
    'R6',
    'Total within remaining budget',
    total !== null && total <= remaining,
    `<= ${remaining}`,
    total === null ? 'unpriceable (invalid quantity or negative amount)' : `${total}`,
  );
};

export const R7: Rule = (m, p) => {
  const eta = dateMs(p.etaDate);
  const by = dateMs(m.deliverBy);
  return r(
    'R7',
    'Arrives on time',
    Number.isFinite(eta) && Number.isFinite(by) && eta <= by,
    `<= ${m.deliverBy}`,
    p.etaDate,
  );
};

export const R8: Rule = (m, _p, c) => {
  const by = dateMs(m.deliverBy);
  const now = instantMs(c.now);
  const limitDay = Math.floor(now / 86_400_000) * 86_400_000 + AUTH_VALIDITY_DAYS * 86_400_000;
  const limit = new Date(limitDay);
  return r(
    'R8',
    'Delivery window fits PayPal authorization validity',
    Number.isFinite(by) && Number.isFinite(now) && by <= limitDay,
    `<= ${Number.isFinite(now) ? limit.toISOString().slice(0, 10) : 'now + 29 days'}`,
    m.deliverBy,
  );
};

export const R9: Rule = (m, p) => {
  const allow = m.allowedDomains;
  const domain = normalizeDomain(p.domain);
  const domainOk = allow === undefined || allow.length === 0 || allow.map(normalizeDomain).includes(domain);
  const ratingOk = m.minRating === undefined || (p.rating !== undefined && p.rating >= m.minRating);
  return r(
    'R9',
    'Supplier allowed and rated',
    domainOk && ratingOk,
    `domain in [${(allow ?? []).join(', ') || 'any'}] and rating >= ${m.minRating ?? 'any'}`,
    `${p.domain}, rating ${p.rating ?? 'unknown'}`,
  );
};

export const R10: Rule = (_m, p) =>
  r('R10', 'In stock', p.inStock === true, 'in stock', p.inStock ? 'in stock' : 'out of stock');

export const R11: Rule = (m, p) => {
  const missing = (m.spec.mustInclude ?? []).filter((t) => t.trim() !== '' && !hasWholeWord(p.title, t));
  const present = (m.spec.mustExclude ?? []).filter((t) => hasWholeWord(p.title, t));
  const problems = [
    ...missing.map((t) => `missing "${t}"`),
    ...present.map((t) => `contains excluded "${t}"`),
  ];
  return r(
    'R11',
    'Spec match',
    problems.length === 0,
    `include [${(m.spec.mustInclude ?? []).join(', ')}], exclude [${(m.spec.mustExclude ?? []).join(', ')}]`,
    problems.length === 0 ? 'matches' : problems.join('; '),
  );
};

export const RULES: readonly Rule[] = [R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11];
