import { describe, expect, it } from 'vitest';
import { DomainError, HTTP_STATUS } from '../src/index.ts';
import type { ErrorCode } from '../src/index.ts';

describe('HTTP_STATUS', () => {
  it('maps every error code to a 4xx/5xx status', () => {
    const entries = Object.entries(HTTP_STATUS);
    expect(entries).toHaveLength(20);
    for (const [, status] of entries) {
      expect(Number.isInteger(status)).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
  it('uses the documented statuses for the money-safety codes', () => {
    expect(HTTP_STATUS.WRITES_DISABLED).toBe(503);
    expect(HTTP_STATUS.PAYPAL_ERROR).toBe(502);
    expect(HTTP_STATUS.VALIDATION).toBe(400);
    expect(HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(HTTP_STATUS.GATE_FAILED).toBe(409);
    expect(HTTP_STATUS.PROOF_GATE_FAILED).toBe(409);
    expect(HTTP_STATUS.INTERNAL).toBe(500);
  });
});

describe('DomainError', () => {
  it('is a real Error carrying code, details and PayPal diagnostics', () => {
    const err = new DomainError('PAYPAL_ERROR', 'capture failed', {
      details: { order: 'o1' },
      paypalDebugId: 'abc123',
      paypalName: 'INSTRUMENT_DECLINED',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe('DomainError');
    expect(err.message).toBe('capture failed');
    expect(err.code).toBe('PAYPAL_ERROR' satisfies ErrorCode);
    expect(err.details).toEqual({ order: 'o1' });
    expect(err.paypalDebugId).toBe('abc123');
    expect(err.paypalName).toBe('INSTRUMENT_DECLINED');
    expect(err.cause).toBeUndefined();
  });
  it('defaults the optional fields and chains a cause when given', () => {
    const plain = new DomainError('NOT_FOUND', 'nope');
    expect(plain.details).toBeUndefined();
    expect(plain.paypalDebugId).toBeUndefined();
    const root = new Error('boom');
    expect(new DomainError('INTERNAL', 'wrapped', { cause: root }).cause).toBe(root);
  });
});
