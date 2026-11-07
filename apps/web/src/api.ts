import type { Session } from './types.ts';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

let session: Promise<Session> | null = null;

/** The session cookie is set by this call; its CSRF token is what every later write must echo in `x-csrf-token`. */
export function getSession(force = false): Promise<Session> {
  if (!session || force) {
    session = fetch('/api/session', { credentials: 'same-origin' }).then(async (r) => {
      if (!r.ok) throw new ApiError(r.status, 'SESSION', `session failed (${r.status})`);
      return (await r.json()) as Session;
    });
    session.catch(() => { session = null; });
  }
  return session;
}

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const s = await getSession();
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': s.csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `request failed (${res.status})`);
  }
  return json as T;
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
