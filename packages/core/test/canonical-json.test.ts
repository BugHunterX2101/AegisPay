import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/index.ts';

describe('canonicalJson', () => {
  it('sorts keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it('encodes bigint as a decimal string, including beyond 2^53', () => {
    expect(canonicalJson({ n: 9_007_199_254_740_993n })).toBe('{"n":"9007199254740993"}');
    expect(canonicalJson(-5n)).toBe('"-5"');
  });
  it('drops undefined properties but keeps null; undefined array items become null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([1, undefined, 3])).toBe('[1,null,3]');
  });
  it('serialises Date as ISO-8601 and passes primitives through', () => {
    expect(canonicalJson({ t: new Date('2026-11-05T12:00:00Z') })).toBe('{"t":"2026-11-05T12:00:00.000Z"}');
    expect(canonicalJson('s')).toBe('"s"');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(0)).toBe('0');
  });
  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
  it('rejects NaN, ±Infinity, functions and symbols', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson({ x: Number.POSITIVE_INFINITY })).toThrow(TypeError);
    expect(() => canonicalJson([Number.NEGATIVE_INFINITY])).toThrow(TypeError);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(TypeError);
    expect(() => canonicalJson(Symbol('s'))).toThrow(TypeError);
  });

  it('is independent of key insertion order (property, 1,000 runs)', () => {
    const arbValue = fc.dictionary(
      fc.string({ maxLength: 6 }),
      fc.oneof(fc.integer(), fc.string({ maxLength: 8 }), fc.boolean(), fc.bigInt(), fc.constant(null)),
      { maxKeys: 8 },
    );
    fc.assert(
      fc.property(arbValue, (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(obj));
      }),
      { numRuns: 1000 },
    );
  });

  it('output is valid JSON that reparses to the same canonical form (idempotent)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const once = canonicalJson(v);
        expect(canonicalJson(JSON.parse(once))).toBe(once);
      }),
      { numRuns: 1000 },
    );
  });
});
