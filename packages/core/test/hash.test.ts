import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZERO_HASH, sha256Hex } from '../src/index.ts';

describe('sha256Hex', () => {
  it('matches the published NIST vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('hashes strings as UTF-8 and equals the same bytes passed as Uint8Array', () => {
    const s = 'Café – 日本語';
    expect(sha256Hex(s)).toBe(sha256Hex(new TextEncoder().encode(s)));
    expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
  });
  it('is 64 lowercase hex characters', () => {
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ZERO_HASH', () => {
  it('is the 64-zero genesis prev_hash of the audit chain', () => {
    expect(ZERO_HASH).toBe('0'.repeat(64));
    expect(ZERO_HASH).toHaveLength(64);
  });
});
