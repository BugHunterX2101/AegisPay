import { randomBytes } from 'node:crypto';

/**
 * UUID v7 (RFC 9562): 48-bit unix-ms timestamp, version 7, variant 10, 74 random bits.
 * Time-ordered, so primary keys cluster by creation time. Node's randomUUID() is v4 only.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const b = randomBytes(16);
  b[0] = Math.floor(nowMs / 2 ** 40) & 0xff;
  b[1] = Math.floor(nowMs / 2 ** 32) & 0xff;
  b[2] = Math.floor(nowMs / 2 ** 24) & 0xff;
  b[3] = Math.floor(nowMs / 2 ** 16) & 0xff;
  b[4] = Math.floor(nowMs / 2 ** 8) & 0xff;
  b[5] = nowMs & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
