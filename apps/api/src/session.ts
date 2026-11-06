import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import { DomainError } from '@aegis/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Who is acting, for audit rows: `user:<session id>`. Set for every /api route behind the session guard. */
    actor: string;
  }
}

export interface SessionOptions {
  /** Signs the session cookie and the CSRF secret. */
  secret: string;
  /** `Secure` cookies need https; local http (tests, dev) turns this off. */
  secureCookies: boolean;
  judgeMode: boolean;
  /** Public by design: the browser needs it to load the PayPal SDK. Never the secret. */
  paypalClientId: string;
}

export const SESSION_COOKIE = 'aegis_sid';
const SESSION_MAX_AGE_S = 12 * 3600;

/** Routes that work without a session. Everything else under /api needs one; non-GET also needs a CSRF token. */
const OPEN = new Set(['/api/session', '/api/selfcheck']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const pathOf = (req: FastifyRequest) => req.url.split('?')[0] ?? '';

/**
 * Judge Mode session (TDD "Security design"). A visitor is given an anonymous signed cookie (HttpOnly, SameSite=Lax,
 * Secure over https). It is an identity for the audit log, not a login: the app is a sandbox demo and says so. Every
 * state-changing request must also carry the CSRF token that GET /api/session hands out, so another site cannot make a
 * visitor's browser click "approve".
 */
export async function installSession(app: FastifyInstance, o: SessionOptions): Promise<void> {
  await app.register(cookie, { secret: o.secret });
  await app.register(csrf, {
    cookieOpts: { signed: true, httpOnly: true, sameSite: 'lax', secure: o.secureCookies, path: '/' },
  });

  const sidOf = (req: FastifyRequest): string | null => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return null;
    const u = req.unsignCookie(raw);
    return u.valid && u.value ? u.value : null;
  };

  const runCsrf = (req: FastifyRequest, reply: FastifyReply) =>
    new Promise<void>((resolve, reject) => {
      app.csrfProtection(req, reply, (err?: Error) => (err ? reject(err) : resolve()));
    });

  app.addHook('onRequest', async (req, reply) => {
    const path = pathOf(req);
    if (!path.startsWith('/api/') || OPEN.has(path)) return;
    const sid = sidOf(req);
    if (!sid) throw new DomainError('FORBIDDEN', 'no session: call GET /api/session first');
    req.actor = `user:${sid}`;
    if (!SAFE_METHODS.has(req.method)) {
      try {
        await runCsrf(req, reply);
      } catch {
        throw new DomainError('FORBIDDEN', 'missing or invalid CSRF token');
      }
    }
  });

  app.get('/api/session', { config: { rateLimit: false } }, async (req, reply) => {
    let sid = sidOf(req);
    if (!sid) {
      sid = randomBytes(9).toString('base64url');
      void reply.setCookie(SESSION_COOKIE, sid, {
        signed: true, httpOnly: true, sameSite: 'lax', secure: o.secureCookies, path: '/', maxAge: SESSION_MAX_AGE_S,
      });
    }
    const csrfToken = reply.generateCsrf();
    return { actor: `user:${sid}`, csrfToken, judgeMode: o.judgeMode, paypalEnv: 'sandbox', paypalClientId: o.paypalClientId };
  });
}
