import { execFileSync } from 'node:child_process';
import { createSign, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CERT_URL = 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST-0001';

export interface TestCert {
  certPem: string;
  keyPem: string;
}

/** A real self-signed RSA-2048 certificate and key, made with the openssl CLI (valid for one year). */
export function makeCert(cn = 'api.sandbox.paypal.com'): TestCert {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-cert-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '365', '-subj', `/CN=${cn}`], {
      stdio: 'pipe',
    });
    return { certPem: readFileSync(join(dir, 'cert.pem'), 'utf8'), keyPem: readFileSync(join(dir, 'key.pem'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Independent table-driven CRC-32 (IEEE 802.3), so the signer does not share code with the verifier under test. */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function referenceCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface SignOptions {
  webhookId: string;
  certUrl?: string;
  transmissionId?: string;
  time?: string;
  authAlgo?: string;
}

/** What PayPal puts on a delivery: the five signature headers, signed over the RAW body bytes. */
export function signWebhook(raw: Buffer, cert: TestCert, o: SignOptions): Record<string, string> {
  const id = o.transmissionId ?? randomUUID();
  const time = o.time ?? new Date().toISOString();
  const message = `${id}|${time}|${o.webhookId}|${referenceCrc32(raw)}`;
  const sig = createSign('RSA-SHA256').update(message).sign(cert.keyPem, 'base64');
  return {
    'paypal-transmission-id': id,
    'paypal-transmission-time': time,
    'paypal-transmission-sig': sig,
    'paypal-cert-url': o.certUrl ?? CERT_URL,
    'paypal-auth-algo': o.authAlgo ?? 'SHA256withRSA',
  };
}
