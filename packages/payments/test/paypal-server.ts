import { verify, X509Certificate } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32 } from 'node:zlib';

export interface SeenCall {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: any;
}

export interface Failure {
  /** matches `${METHOD} ${path}` */
  match: RegExp;
  count: number;
  status: number;
  body?: unknown;
}

interface Auth {
  id: string;
  status: 'CREATED' | 'CAPTURED' | 'VOIDED' | 'DENIED' | 'PENDING';
  amount: { currency_code: string; value: string };
  create_time: string;
  expiration_time: string;
  orderId: string;
}

interface Ord {
  id: string;
  approved: boolean;
  authId?: string;
  captureIds: string[];
  request: any;
  tracking: any[];
}

interface Cap {
  id: string;
  amount: { currency_code: string; value: string };
  /** minor units already refunded (COMPLETED and PENDING both reduce what is left) */
  refundedMinor: number;
  refundIds: string[];
}

export interface PayPalServer {
  baseUrl: string;
  seen: SeenCall[];
  orders: Map<string, Ord>;
  auths: Map<string, Auth>;
  captures: Map<string, Cap>;
  failures: Failure[];
  /** the buyer approving the order in the PayPal popup */
  approve(orderId: string): void;
  /** what a capture returns (default COMPLETED) */
  captureStatus: string;
  /** what a refund returns (default COMPLETED) */
  refundStatus: string;
  /** extra latency per request, so concurrent callers genuinely overlap */
  delayMs: number;
  /** The webhook this server verifies for: its id and the PEM certificate whose key signs deliveries. */
  webhook?: { webhookId: string; certPem: string };
  /** event ids handed out by simulate-event */
  simulated: string[];
  close(): Promise<void>;
}

const D = (s: string) => Math.round(Number(s) * 100);

/**
 * A real HTTP server speaking PayPal's Orders v2 / Payments v2 REST contract, with the validation rules PayPal
 * documents: breakdown must add up, item tax must agree with tax_total, invoice_id is unique, an order must be
 * approved before it can be authorized, an authorization can be captured or voided once, and `PayPal-Request-Id`
 * makes a repeated POST return the original response instead of acting again.
 *
 * It stands in for the sandbox only because the suite must run without credentials; `sandbox.contract` tests run
 * the same operations against the real sandbox.
 */
export async function startPayPalServer(): Promise<PayPalServer> {
  const seen: SeenCall[] = [];
  const orders = new Map<string, Ord>();
  const auths = new Map<string, Auth>();
  const captures = new Map<string, Cap>();
  const invoices = new Set<string>();
  const idem = new Map<string, { status: number; body: unknown }>();
  const failures: Failure[] = [];
  let seq = 0;

  const self: PayPalServer = {
    baseUrl: '',
    seen,
    orders,
    auths,
    captures,
    failures,
    captureStatus: 'COMPLETED',
    refundStatus: 'COMPLETED',
    delayMs: 0,
    simulated: [],
    approve: (id) => {
      const o = orders.get(id);
      if (!o) throw new Error(`no such order ${id}`);
      o.approved = true;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };

  const err = (status: number, name: string, message: string, details: unknown[] = []) => ({
    status,
    body: { name, message, debug_id: `dbg-${seen.length}`, details },
  });
  const unprocessable = (issue: string) =>
    err(422, 'UNPROCESSABLE_ENTITY', 'The requested action could not be performed, semantically incorrect, or failed business validation.', [{ issue }]);

  const authView = (a: Auth) => ({ id: a.id, status: a.status, amount: a.amount, create_time: a.create_time, expiration_time: a.expiration_time });

  function handle(method: string, path: string, headers: IncomingHttpHeaders, body: any, rawText = ''): { status: number; body: unknown } {
    if (!/^Bearer tok-/.test(String(headers.authorization ?? ''))) return err(401, 'AUTHENTICATION_FAILURE', 'Authentication failed due to invalid authentication credentials');
    const key = `${method} ${path}`;
    const f = failures.find((x) => x.count > 0 && x.match.test(key));
    if (f) {
      f.count--;
      return { status: f.status, body: f.body ?? { name: 'INTERNAL_SERVER_ERROR', message: 'An internal server error occurred.', debug_id: `dbg-${seen.length}` } };
    }
    const rid = headers['paypal-request-id'] as string | undefined;
    if (method === 'POST' && rid && idem.has(`${rid}|${key}`)) return idem.get(`${rid}|${key}`)!;
    const done = (res: { status: number; body: unknown }) => {
      if (method === 'POST' && rid && res.status < 300) idem.set(`${rid}|${key}`, res);
      return res;
    };
    const now = new Date();

    if (key === 'POST /v1/notifications/simulate-event') {
      if (!body?.webhook_id || !body?.event_type) return err(400, 'INVALID_REQUEST', 'Request is not well-formed, syntactically incorrect, or violates schema.');
      const id = `WH-SIM-${++seq}`;
      self.simulated.push(id);
      return { status: 202, body: { id, event_type: body.event_type } };
    }

    if (key === 'POST /v1/notifications/verify-webhook-signature') {
      // PayPal checks the signature over the event exactly as it was posted: the raw text after `"webhook_event":`.
      const marker = '"webhook_event":';
      const at = rawText.indexOf(marker);
      if (!self.webhook || at < 0 || !rawText.endsWith('}')) return err(400, 'INVALID_REQUEST', 'Request is not well-formed, syntactically incorrect, or violates schema.');
      const rawEvent = rawText.slice(at + marker.length, -1);
      const message = `${body.transmission_id}|${body.transmission_time}|${body.webhook_id}|${crc32(Buffer.from(rawEvent, 'utf8')) >>> 0}`;
      let ok = body.webhook_id === self.webhook.webhookId && body.auth_algo === 'SHA256withRSA';
      if (ok) {
        try {
          ok = verify('RSA-SHA256', Buffer.from(message), new X509Certificate(self.webhook.certPem).publicKey, Buffer.from(String(body.transmission_sig), 'base64'));
        } catch {
          ok = false;
        }
      }
      return { status: 200, body: { verification_status: ok ? 'SUCCESS' : 'FAILURE' } };
    }

    if (key === 'POST /v2/checkout/orders') {
      const pu = body?.purchase_units?.[0];
      if (body?.intent !== 'AUTHORIZE' && body?.intent !== 'CAPTURE') return err(400, 'INVALID_REQUEST', 'Request is not well-formed, syntactically incorrect, or violates schema.');
      const bd = pu?.amount?.breakdown;
      const items: any[] = pu?.items ?? [];
      if (bd) {
        const itemSum = items.reduce((s, i) => s + D(i.unit_amount.value) * Number(i.quantity), 0);
        if (D(bd.item_total.value) !== itemSum) return unprocessable('ITEM_TOTAL_MISMATCH');
        const total = D(bd.item_total.value) + D(bd.shipping?.value ?? '0') + D(bd.tax_total?.value ?? '0');
        if (D(pu.amount.value) !== total) return unprocessable('AMOUNT_MISMATCH');
        if (items.some((i) => i.tax)) {
          const taxSum = items.reduce((s, i) => s + D(i.tax?.value ?? '0') * Number(i.quantity), 0);
          if (D(bd.tax_total?.value ?? '0') !== taxSum) return unprocessable('TAX_TOTAL_MISMATCH');
        }
      }
      if (pu?.invoice_id) {
        if (invoices.has(pu.invoice_id)) return unprocessable('DUPLICATE_INVOICE_ID');
        invoices.add(pu.invoice_id);
      }
      const id = `ORDER-${++seq}`;
      orders.set(id, { id, approved: false, captureIds: [], request: body, tracking: [] });
      return done({
        status: 201,
        body: {
          id,
          status: 'PAYER_ACTION_REQUIRED',
          intent: body.intent,
          purchase_units: [{ reference_id: pu?.reference_id, amount: pu?.amount, custom_id: pu?.custom_id, invoice_id: pu?.invoice_id }],
        },
      });
    }

    let m = /^(GET|POST) \/v2\/checkout\/orders\/([^/]+)(?:\/(authorize|track))?$/.exec(key);
    if (m) {
      const o = orders.get(m[2]!);
      if (!o) return err(404, 'RESOURCE_NOT_FOUND', 'The specified resource does not exist.', [{ issue: 'INVALID_RESOURCE_ID' }]);
      const pu = o.request.purchase_units[0];
      const render = () => ({
        id: o.id,
        status: o.authId ? 'COMPLETED' : o.approved ? 'APPROVED' : 'PAYER_ACTION_REQUIRED',
        intent: 'AUTHORIZE',
        payer: o.approved ? { payer_id: 'PAYER123' } : undefined,
        purchase_units: [
          {
            reference_id: pu.reference_id,
            amount: pu.amount,
            payments: o.authId ? { authorizations: [authView(auths.get(o.authId)!)] } : undefined,
          },
        ],
      });
      if (m[1] === 'GET') return { status: 200, body: render() };
      if (m[3] === 'authorize') {
        if (o.authId) return unprocessable('ORDER_ALREADY_AUTHORIZED');
        if (!o.approved) return unprocessable('ORDER_NOT_APPROVED');
        const a: Auth = {
          id: `AUTH-${++seq}`,
          status: 'CREATED',
          amount: pu.amount ? { currency_code: pu.amount.currency_code, value: pu.amount.value } : { currency_code: 'USD', value: '0.00' },
          create_time: now.toISOString(),
          expiration_time: new Date(now.getTime() + 29 * 86_400_000).toISOString(),
          orderId: o.id,
        };
        auths.set(a.id, a);
        o.authId = a.id;
        return done({ status: 201, body: render() });
      }
      if (m[3] === 'track') {
        if (!o.captureIds.includes(body?.capture_id)) return unprocessable('INVALID_CAPTURE_ID');
        o.tracking.push(body);
        return done({ status: 201, body: render() });
      }
    }

    m = /^(GET|POST) \/v2\/payments\/authorizations\/([^/]+)(?:\/(capture|void|reauthorize))?$/.exec(key);
    if (m) {
      const a = auths.get(m[2]!);
      if (!a) return err(404, 'RESOURCE_NOT_FOUND', 'The specified resource does not exist.', [{ issue: 'INVALID_RESOURCE_ID' }]);
      if (m[1] === 'GET') return { status: 200, body: authView(a) };
      if (m[3] === 'capture') {
        if (a.status === 'CAPTURED') return unprocessable('AUTHORIZATION_ALREADY_CAPTURED');
        if (a.status === 'VOIDED') return unprocessable('AUTHORIZATION_VOIDED');
        if (new Date(a.expiration_time) <= now) return unprocessable('AUTHORIZATION_EXPIRED');
        const amt = body?.amount ?? a.amount;
        if (D(amt.value) > D(a.amount.value)) return unprocessable('CAPTURE_AMOUNT_EXCEEDS_AUTHORIZED');
        const capId = `CAP-${++seq}`;
        orders.get(a.orderId)!.captureIds.push(capId);
        captures.set(capId, { id: capId, amount: { currency_code: amt.currency_code, value: amt.value }, refundedMinor: 0, refundIds: [] });
        a.status = 'CAPTURED';
        return done({ status: 201, body: { id: capId, status: self.captureStatus, amount: amt, final_capture: body?.final_capture === true, create_time: now.toISOString() } });
      }
      if (m[3] === 'void') {
        if (a.status === 'CAPTURED') return unprocessable('AUTHORIZATION_ALREADY_CAPTURED');
        if (a.status === 'VOIDED') return unprocessable('AUTHORIZATION_VOIDED');
        a.status = 'VOIDED';
        return done({ status: 204, body: undefined });
      }
      if (m[3] === 'reauthorize') {
        if (a.status !== 'CREATED') return unprocessable('REAUTHORIZATION_NOT_ALLOWED');
        const n: Auth = { ...a, id: `AUTH-${++seq}`, create_time: now.toISOString(), expiration_time: new Date(now.getTime() + 29 * 86_400_000).toISOString() };
        auths.set(n.id, n);
        orders.get(a.orderId)!.authId = n.id;
        a.status = 'VOIDED';
        return done({ status: 201, body: authView(n) });
      }
    }
    m = /^(GET|POST) \/v2\/payments\/captures\/([^/]+)(?:\/(refund))?$/.exec(key);
    if (m) {
      const c = captures.get(m[2]!);
      if (!c) return err(404, 'RESOURCE_NOT_FOUND', 'The specified resource does not exist.', [{ issue: 'INVALID_RESOURCE_ID' }]);
      const left = D(c.amount.value) - c.refundedMinor;
      if (m[1] === 'GET') {
        return {
          status: 200,
          body: { id: c.id, status: left === 0 ? 'REFUNDED' : c.refundedMinor > 0 ? 'PARTIALLY_REFUNDED' : 'COMPLETED', amount: c.amount },
        };
      }
      // An empty body refunds whatever is left; an amount refunds that much, never more than what is left.
      const amt = body?.amount ?? { currency_code: c.amount.currency_code, value: (left / 100).toFixed(2) };
      if (left === 0) return unprocessable('CAPTURE_FULLY_REFUNDED');
      if (amt.currency_code !== c.amount.currency_code) return unprocessable('REFUND_CURRENCY_MISMATCH');
      if (D(amt.value) > left) return unprocessable('REFUND_AMOUNT_EXCEEDED');
      const refId = `REF-${++seq}`;
      c.refundedMinor += D(amt.value);
      c.refundIds.push(refId);
      return done({ status: 201, body: { id: refId, status: self.refundStatus, amount: amt, note_to_payer: body?.note_to_payer, create_time: now.toISOString() } });
    }
    return err(404, 'RESOURCE_NOT_FOUND', `No route for ${key}`);
  }

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed: any;
      try {
        parsed = raw ? JSON.parse(raw) : undefined;
      } catch {
        parsed = undefined;
      }
      const path = (req.url ?? '').split('?')[0]!;
      seen.push({ method: req.method ?? '', path, headers: req.headers, body: parsed });
      setTimeout(() => {
        const r = handle(req.method ?? '', path, req.headers, parsed, raw);
        res.writeHead(r.status, { 'content-type': 'application/json', 'paypal-debug-id': `dbg-${seen.length}` });
        res.end(r.body === undefined ? undefined : JSON.stringify(r.body));
      }, self.delayMs);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  self.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return self;
}

/**
 * axios `adapter` for the SDK's `unstable_httpClientOptions`: the SDK hard-codes https://api-m.sandbox.paypal.com,
 * so each request is re-issued over a real socket to the local server instead (same method, path, headers, body).
 */
export function sdkAdapter(server: PayPalServer) {
  return async (config: any) => {
    const url = new URL(config.url);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.headers?.toJSON?.() ?? config.headers ?? {})) if (v !== undefined && v !== null) headers[k] = String(v);
    const res = await fetch(`${server.baseUrl}${url.pathname}${url.search}`, {
      method: String(config.method).toUpperCase(),
      headers,
      ...(config.data !== undefined ? { body: typeof config.data === 'string' ? config.data : JSON.stringify(config.data) } : {}),
    });
    const text = await res.text();
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => (out[k] = v));
    return { data: text, status: res.status, statusText: res.statusText, headers: out, config, request: {} };
  };
}
