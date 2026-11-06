import { verify, X509Certificate } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { systemClock } from '@aegis/core';
import type { Clock } from '@aegis/core';

/** PayPal's signing certificates are served only from these hosts. Anything else is refused before any fetch. */
export const CERT_HOSTS: readonly string[] = ['api.paypal.com', 'api.sandbox.paypal.com'];
export const CERT_PATH_PREFIX = '/v1/notifications/certs/';
export const CERT_TTL_MS = 24 * 3_600_000;
const MAX_CERT_BYTES = 64 * 1024;

export interface WebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

export type OfflineResult = { ok: true } | { ok: false; reason: string };

type HeaderBag = Record<string, string | string[] | undefined>;

/** Reads PayPal's five signature headers (Node lower-cases incoming header names). */
export function parseWebhookHeaders(h: HeaderBag): { ok: true; headers: WebhookHeaders } | { ok: false; reason: string } {
  const one = (name: string): string | undefined => {
    const v = h[name];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const transmissionId = one('paypal-transmission-id');
  const transmissionTime = one('paypal-transmission-time');
  const transmissionSig = one('paypal-transmission-sig');
  const certUrl = one('paypal-cert-url');
  const authAlgo = one('paypal-auth-algo');
  const missing = (
    [['paypal-transmission-id', transmissionId], ['paypal-transmission-time', transmissionTime], ['paypal-transmission-sig', transmissionSig], ['paypal-cert-url', certUrl], ['paypal-auth-algo', authAlgo]] as const
  ).filter(([, v]) => v === undefined).map(([n]) => n);
  if (missing.length) return { ok: false, reason: `MISSING_HEADER: ${missing.join(', ')}` };
  return { ok: true, headers: { transmissionId: transmissionId!, transmissionTime: transmissionTime!, transmissionSig: transmissionSig!, certUrl: certUrl!, authAlgo: authAlgo! } };
}

/** CRC32 of the raw bytes as an unsigned decimal string (PayPal's wording: "in decimal format"). */
export function crc32Decimal(raw: Buffer): string {
  return String(crc32(raw) >>> 0);
}

/** The signed string: `transmission_id|transmission_time|webhook_id|crc32`. */
export function signedMessage(h: Pick<WebhookHeaders, 'transmissionId' | 'transmissionTime'>, webhookId: string, raw: Buffer): string {
  return `${h.transmissionId}|${h.transmissionTime}|${webhookId}|${crc32Decimal(raw)}`;
}

/** Returns the URL only if it is https, on an allow-listed host, with no credentials/port, under the certs path. */
export function checkCertUrl(raw: string, hosts: readonly string[] = CERT_HOSTS): URL | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'https:' || !hosts.includes(u.hostname) || u.username || u.password || u.port) return undefined;
  if (!u.pathname.startsWith(CERT_PATH_PREFIX) || u.pathname.length === CERT_PATH_PREFIX.length || u.pathname.includes('..')) return undefined;
  return u;
}

/** Fetches a PEM certificate. Real HTTPS, no redirects, bounded size and time. */
export async function fetchCertPem(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`certificate fetch answered ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_CERT_BYTES) throw new Error('certificate response too large');
  return text;
}

/** Parsed certificates by URL, for 24 h, so a webhook burst does not refetch the cert for every event. */
export class CertCache {
  private readonly entries = new Map<string, { cert: X509Certificate; fetchedAt: number }>();
  constructor(
    private readonly clock: Clock = systemClock,
    private readonly fetchPem: (url: string) => Promise<string> = fetchCertPem,
  ) {}

  async get(url: string): Promise<X509Certificate> {
    const hit = this.entries.get(url);
    const now = this.clock.now().getTime();
    if (hit && now - hit.fetchedAt < CERT_TTL_MS) return hit.cert;
    const pem = await this.fetchPem(url);
    const cert = new X509Certificate(pem); // throws on anything that is not a certificate
    this.entries.set(url, { cert, fetchedAt: now });
    return cert;
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface OfflineInput {
  raw: Buffer;
  headers: HeaderBag;
  webhookId: string;
  certs: CertCache;
  clock?: Clock;
  certHosts?: readonly string[];
}

/**
 * Offline verification (TDD "Webhook verification algorithm", step 2): rebuild the signed message from the headers,
 * the webhook id and the CRC32 of the RAW body, and check the RSA-SHA256 signature against the transmitted
 * certificate. Used for simulator events, which postback verification does not support.
 */
export async function verifyOffline(i: OfflineInput): Promise<OfflineResult> {
  const parsed = parseWebhookHeaders(i.headers);
  if (!parsed.ok) return parsed;
  const h = parsed.headers;
  if (!i.webhookId) return { ok: false, reason: 'WEBHOOK_ID_NOT_CONFIGURED' };
  if (h.authAlgo.toUpperCase() !== 'SHA256WITHRSA') return { ok: false, reason: `AUTH_ALGO_UNSUPPORTED: ${h.authAlgo}` };
  if (!checkCertUrl(h.certUrl, i.certHosts)) return { ok: false, reason: 'CERT_URL_REJECTED' };

  let cert: X509Certificate;
  try {
    cert = await i.certs.get(h.certUrl);
  } catch (e) {
    return { ok: false, reason: `CERT_UNAVAILABLE: ${e instanceof Error ? e.message : String(e)}` };
  }
  const now = (i.clock ?? systemClock).now().getTime();
  if (now < new Date(cert.validFrom).getTime() || now > new Date(cert.validTo).getTime()) return { ok: false, reason: 'CERT_NOT_VALID_NOW' };
  if (cert.publicKey.asymmetricKeyType !== 'rsa') return { ok: false, reason: 'CERT_KEY_NOT_RSA' };

  let sig: Buffer;
  try {
    sig = Buffer.from(h.transmissionSig, 'base64');
  } catch {
    return { ok: false, reason: 'SIGNATURE_NOT_BASE64' };
  }
  if (sig.length === 0) return { ok: false, reason: 'SIGNATURE_NOT_BASE64' };
  const message = Buffer.from(signedMessage(h, i.webhookId, i.raw), 'utf8');
  return verify('RSA-SHA256', message, cert.publicKey, sig) ? { ok: true } : { ok: false, reason: 'SIGNATURE_MISMATCH' };
}
