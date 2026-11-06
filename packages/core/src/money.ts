/**
 * Money is ALWAYS integer minor units (bigint cents). Floats never touch an amount.
 * Conversion to PayPal's decimal string happens only in `usd.toPayPal`.
 */
export type Minor = bigint;
export type Currency = 'USD';

const USD_RE = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

export const usd = {
  /** "180", "180.5", "180.50" → 18000n. Rejects negatives, exponents, >2 decimals. */
  parse(s: string): Minor {
    const m = USD_RE.exec(s.trim());
    if (!m) throw new RangeError(`Invalid USD amount: "${s}"`);
    const dollars = BigInt(m[1]!);
    const cents = BigInt((m[2] ?? '').padEnd(2, '0') || '0');
    return dollars * 100n + cents;
  },
  /** 18000n → "$180.00" (display only). */
  format(m: Minor): string {
    const neg = m < 0n;
    const abs = neg ? -m : m;
    const d = abs / 100n;
    const c = (abs % 100n).toString().padStart(2, '0');
    return `${neg ? '-' : ''}$${d.toLocaleString('en-US')}.${c}`;
  },
  /** 18000n → "180.00" — the only form PayPal accepts. */
  toPayPal(m: Minor): string {
    if (m < 0n) throw new RangeError('Negative amounts cannot be sent to PayPal');
    const d = m / 100n;
    const c = (m % 100n).toString().padStart(2, '0');
    return `${d}.${c}`;
  },
  /** PayPal's "180.00" → 18000n. Same strictness as parse. */
  fromPayPal(s: string): Minor {
    return usd.parse(s);
  },
};

/** API/JSON transport: bigint ↔ decimal string of minor units. */
export const minorToString = (m: Minor): string => m.toString(10);
export function minorFromString(s: string): Minor {
  if (!/^\d{1,18}$/.test(s)) throw new RangeError(`Invalid minor-unit string: "${s}"`);
  return BigInt(s);
}
