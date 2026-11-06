import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { paypalRequestId } from '../src/request-id.ts';
import type { PayPalAction } from '../src/request-id.ts';

describe('paypalRequestId', () => {
  it('equals an independent sha256 of "orderRowId:action:attempt", 64 lowercase hex chars', () => {
    const id = paypalRequestId('0192-abc', 'capture', 1);
    expect(id).toBe(createHash('sha256').update('0192-abc:capture:1').digest('hex'));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: a retry of the same operation re-sends the same id', () => {
    expect(paypalRequestId('o1', 'void')).toBe(paypalRequestId('o1', 'void', 1));
    expect(paypalRequestId('o1', 'void', 3)).toBe(paypalRequestId('o1', 'void', 3));
  });

  it('differs per order, per action and per attempt', () => {
    const ids = new Set([
      paypalRequestId('o1', 'capture'),
      paypalRequestId('o2', 'capture'),
      paypalRequestId('o1', 'void'),
      paypalRequestId('o1', 'capture', 2),
    ]);
    expect(ids.size).toBe(4);
  });

  it('rejects an empty/colon-bearing order id and a non-positive or fractional attempt', () => {
    expect(() => paypalRequestId('', 'capture')).toThrow(/orderRowId/);
    expect(() => paypalRequestId('a:b', 'capture')).toThrow(/orderRowId/);
    expect(() => paypalRequestId('o1', 'capture', 0)).toThrow(/attempt/);
    expect(() => paypalRequestId('o1', 'capture', 1.5)).toThrow(/attempt/);
    expect(() => paypalRequestId('o1', 'capture', Number.NaN)).toThrow(/attempt/);
  });

  it('property: distinct (order, action, attempt) triples never collide', () => {
    const action = fc.constantFrom<PayPalAction>('create_order', 'authorize', 'capture', 'void', 'reauthorize', 'refund', 'track');
    const triple = fc.tuple(fc.stringMatching(/^[0-9a-f-]{1,36}$/), action, fc.integer({ min: 1, max: 50 }));
    fc.assert(
      fc.property(triple, triple, (a, b) => {
        const same = a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
        expect(paypalRequestId(...a) === paypalRequestId(...b)).toBe(same);
      }),
      { numRuns: 1000 },
    );
  });
});
