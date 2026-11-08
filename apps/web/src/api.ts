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

async function send(method: 'GET' | 'POST', path: string, body: unknown, csrfToken: string): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body, (await getSession()).csrfToken);
  // The server may have restarted since the page loaded, which invalidates the cookie and its CSRF token: get a fresh
  // session once and retry, instead of leaving every button failing until the person reloads.
  if (res.status === 401 || res.status === 403) {
    res = await send(method, path, body, (await getSession(true)).csrfToken);
  }
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // A proxy or gateway answered with a page, not JSON: say what happened, not "Unexpected token <".
    if (!res.ok) throw new ApiError(res.status, 'ERROR', `The server answered ${res.status} with something unreadable. Try again in a moment.`);
    throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent a reply this page could not read.');
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `request failed (${res.status})`);
  }
  return json as T;
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
