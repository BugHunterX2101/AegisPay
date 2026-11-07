/**
 * A tiny client for a RUNNING AegisPay API (local or the Render deploy). The scripts talk to the real service over HTTP,
 * exactly as the browser does: a session, the CSRF token, JSON. Nothing here touches the database or any secret.
 *
 * APP_URL overrides the target; the default is the local dev API.
 */
export const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface Session {
  cookie: string;
  csrfToken: string;
  actor: string;
}

export async function openSession(): Promise<Session> {
  const res = await fetch(`${APP_URL}/api/session`, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`GET /api/session -> ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const body = (await res.json()) as { csrfToken: string; actor: string };
  return { cookie, csrfToken: body.csrfToken, actor: body.actor };
}

export async function call<T>(s: Session | null, method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 90_000): Promise<T> {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: {
      ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrfToken } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : null) as (T & { error?: { code?: string; message?: string } }) | null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ''}: ${json?.error?.message ?? text.slice(0, 200)}`);
  return json as T;
}

export interface ProbeResult {
  name: string;
  ok: boolean;
  ms: number;
  debugId?: string;
  detail?: string;
}
export interface SelfCheckBody {
  probes: ProbeResult[];
  checkedAt: string;
}

/** Print a self-check as a table and say whether every probe passed. */
export function printSelfCheck(r: SelfCheckBody): boolean {
  for (const p of r.probes) {
    const mark = p.ok ? 'PASS' : 'FAIL';
    const dbg = p.debugId ? ` [paypal-debug-id ${p.debugId}]` : '';
    console.log(`  ${mark}  ${p.name.padEnd(9)} ${String(p.ms).padStart(5)} ms  ${p.detail ?? ''}${dbg}`);
  }
  return r.probes.every((p) => p.ok);
}
