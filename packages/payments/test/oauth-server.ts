import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SeenRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface OAuthServerOptions {
  clientId: string;
  clientSecret: string;
  /** seconds, may be a function of the n-th token issued (1-based) */
  expiresIn?: number | ((n: number) => number);
  /** artificial latency so concurrent callers genuinely overlap */
  delayMs?: number;
  /** force the next N token requests to fail with this status */
  failNext?: { count: number; status: number; body?: unknown };
}

export interface OAuthServer {
  baseUrl: string;
  seen: SeenRequest[];
  issued: () => number;
  opts: OAuthServerOptions;
  close(): Promise<void>;
}

/**
 * A real HTTP server speaking PayPal's OAuth contract: POST /v1/oauth2/token, HTTP Basic client auth,
 * form-encoded grant_type=client_credentials. The TokenVault talks to it over a real socket.
 * (It stands in for the sandbox only because tests must run without credentials; sandbox.contract tests hit the real one.)
 */
export async function startOAuthServer(opts: OAuthServerOptions): Promise<OAuthServer> {
  const seen: SeenRequest[] = [];
  let issued = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const reply = (status: number, json: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json', 'paypal-debug-id': `dbg-${seen.length}` });
        res.end(JSON.stringify(json));
      };
      setTimeout(() => {
        if (opts.failNext && opts.failNext.count > 0) {
          opts.failNext.count--;
          return reply(opts.failNext.status, opts.failNext.body ?? { error: 'server_error' });
        }
        const expected = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}`;
        if (req.method !== 'POST' || req.url !== '/v1/oauth2/token') return reply(404, { error: 'not_found' });
        if (req.headers.authorization !== expected) return reply(401, { error: 'invalid_client', error_description: 'Client Authentication failed' });
        if (new URLSearchParams(body).get('grant_type') !== 'client_credentials') return reply(400, { error: 'unsupported_grant_type' });
        issued++;
        const ex = typeof opts.expiresIn === 'function' ? opts.expiresIn(issued) : (opts.expiresIn ?? 32_400);
        reply(200, { access_token: `tok-${issued}`, token_type: 'Bearer', expires_in: ex, scope: 'https://uri.paypal.com/services/payments/payment' });
      }, opts.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    seen,
    issued: () => issued,
    opts,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
