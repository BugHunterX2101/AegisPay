import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { minorFromString, minorToString, usd } from '../src/index.ts';

describe('usd.parse', () => {
  it.each([
    ['180', 18000n],
    ['180.5', 18050n],
    ['180.50', 18050n],
    ['0', 0n],
    ['0.01', 1n],
    ['0.1', 10n],
    ['  12.34  ', 1234n],
    ['999999999999.99', 99_999_999_999_999n],
  ])('parses %j → %s', (input, expected) => {
    expect(usd.parse(input)).toBe(expected);
  });

  it.each(['', '-1', '-0.01', '1e3', '1.234', '1.', '.5', 'abc', '1,000.00', '1 000', '+5', '0x10', '1000000000000'])(
    'rejects %j',
    (input) => {
      expect(() => usd.parse(input)).toThrow(RangeError);
    },
  );
});

describe('usd.format (display only)', () => {
  it.each([
    [18000n, '$180.00'],
    [0n, '$0.00'],
    [5n, '$0.05'],
    [123_456_789n, '$1,234,567.89'],
    [-5n, '-$0.05'],
    [-123_456n, '-$1,234.56'],
  ])('formats %s → %s', (input, expected) => {
    expect(usd.format(input)).toBe(expected);
  });
});

describe('usd.toPayPal / fromPayPal', () => {
  it('always emits exactly two decimals with no thousands separator', () => {
    expect(usd.toPayPal(18000n)).toBe('180.00');
    expect(usd.toPayPal(1n)).toBe('0.01');
    expect(usd.toPayPal(0n)).toBe('0.00');
    expect(usd.toPayPal(123_456_789n)).toBe('1234567.89');
  });
  it('refuses to send a negative amount to PayPal', () => {
    expect(() => usd.toPayPal(-1n)).toThrow(RangeError);
  });
  it('fromPayPal is as strict as parse', () => {
    expect(usd.fromPayPal('180.00')).toBe(18000n);
    expect(() => usd.fromPayPal('180.001')).toThrow(RangeError);
  });
  it('round-trips every amount the parser accepts (property, 2,000 runs)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 99_999_999_999_999n }), (m) => {
        expect(usd.fromPayPal(usd.toPayPal(m))).toBe(m);
      }),
      { numRuns: 2000 },
    );
  });
  it('agrees with an independent integer-string recomputation (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), (n) => {
        const expected = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
        expect(usd.toPayPal(BigInt(n))).toBe(expected);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('minor-unit transport strings', () => {
  it('round-trips', () => {
    expect(minorToString(171000n)).toBe('171000');
    expect(minorFromString('171000')).toBe(171000n);
    expect(minorFromString(minorToString(0n))).toBe(0n);
  });
  it.each(['', '-1', '1.5', '1e3', ' 1', '1 ', 'abc', '9'.repeat(19)])('rejects %j', (s) => {
    expect(() => minorFromString(s)).toThrow(RangeError);
  });
  it('accepts up to 18 digits', () => {
    expect(minorFromString('9'.repeat(18))).toBe(999_999_999_999_999_999n);
  });
});
