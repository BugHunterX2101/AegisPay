/**
 * Deterministic JSON for hashing: keys sorted recursively, bigint → decimal string,
 * undefined properties dropped. Same input ⇒ same bytes on every machine.
 */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(normalize(v));
}

function normalize(v: unknown): unknown {
  if (v === null) return null;
  switch (typeof v) {
    case 'bigint':
      return v.toString(10);
    case 'string':
    case 'boolean':
      return v;
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError('canonicalJson: non-finite number');
      return v;
    case 'undefined':
      return undefined;
    case 'object': {
      if (v instanceof Date) return v.toISOString();
      if (Array.isArray(v)) return v.map((x) => normalize(x) ?? null);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        const n = normalize((v as Record<string, unknown>)[k]);
        if (n !== undefined) out[k] = n;
      }
      return out;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof v}`);
  }
}
