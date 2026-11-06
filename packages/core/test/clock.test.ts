import { describe, expect, it } from 'vitest';
import { DAY_MS, FixedClock, OffsetClock, addDays, systemClock } from '../src/index.ts';

describe('clocks', () => {
  it('systemClock tracks real time', () => {
    const before = Date.now();
    const t = systemClock.now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock returns the same instant, as a fresh Date each call (not aliasable)', () => {
    const c = new FixedClock(new Date('2026-11-05T12:00:00Z'));
    const a = c.now();
    a.setUTCFullYear(1999);
    expect(c.now().toISOString()).toBe('2026-11-05T12:00:00.000Z');
  });

  it('OffsetClock adds the operator offset to its base clock', () => {
    const base = new FixedClock(new Date('2026-11-05T12:00:00Z'));
    const c = new OffsetClock(0, base);
    expect(c.now().toISOString()).toBe('2026-11-05T12:00:00.000Z');
    c.setOffset(30 * DAY_MS);
    expect(c.offset).toBe(30 * DAY_MS);
    expect(c.now().toISOString()).toBe('2026-12-05T12:00:00.000Z');
    c.setOffset(-DAY_MS);
    expect(c.now().toISOString()).toBe('2026-11-04T12:00:00.000Z');
  });

  it('OffsetClock defaults to zero offset over the system clock', () => {
    const c = new OffsetClock();
    expect(c.offset).toBe(0);
    expect(Math.abs(c.now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('OffsetClock rejects a non-finite offset and keeps the previous one', () => {
    const c = new OffsetClock(5);
    expect(() => c.setOffset(Number.NaN)).toThrow(RangeError);
    expect(() => c.setOffset(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(c.offset).toBe(5);
  });

  it('addDays works in whole UTC days and does not mutate its input', () => {
    const d = new Date('2026-11-05T12:00:00Z');
    expect(addDays(d, 29).toISOString()).toBe('2026-12-04T12:00:00.000Z');
    expect(addDays(d, -5).toISOString()).toBe('2026-10-31T12:00:00.000Z');
    expect(d.toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
  });
});
