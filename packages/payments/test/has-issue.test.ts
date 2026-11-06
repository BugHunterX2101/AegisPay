import { describe, expect, it } from 'vitest';
import { DomainError } from '@aegis/core';
import { hasIssue } from '../src/call.ts';

const paypal = (opts: { paypalName?: string; details?: unknown }) => new DomainError('PAYPAL_ERROR', 'x', opts);

describe('hasIssue', () => {
  it('finds the cause PayPal reports in details[].issue (the real error shape: name is a generic UNPROCESSABLE_ENTITY)', () => {
    const err = paypal({ paypalName: 'UNPROCESSABLE_ENTITY', details: { status: 422, issues: [{ issue: 'ORDER_NOT_APPROVED' }] } });
    expect(hasIssue(err, 'ORDER_NOT_APPROVED')).toBe(true);
    expect(hasIssue(err, 'ORDER_ALREADY_AUTHORIZED')).toBe(false);
  });

  it('matches among several issues', () => {
    const err = paypal({ details: { issues: [{ issue: 'A' }, { issue: 'B' }] } });
    expect(hasIssue(err, 'B')).toBe(true);
    expect(hasIssue(err, 'C')).toBe(false);
  });

  it('also matches a top-level name', () => {
    expect(hasIssue(paypal({ paypalName: 'AUTHORIZATION_VOIDED' }), 'AUTHORIZATION_VOIDED')).toBe(true);
  });

  it('is false for non-DomainError values and malformed details', () => {
    expect(hasIssue(new Error('ORDER_NOT_APPROVED'), 'ORDER_NOT_APPROVED')).toBe(false);
    expect(hasIssue(undefined, 'X')).toBe(false);
    expect(hasIssue('X', 'X')).toBe(false);
    expect(hasIssue(paypal({ details: undefined }), 'X')).toBe(false);
    expect(hasIssue(paypal({ details: { issues: 'X' } }), 'X')).toBe(false);
    expect(hasIssue(paypal({ details: { issues: [null, 3, {}] } }), 'X')).toBe(false);
  });
});
