import { DomainError, HTTP_STATUS } from '@aegis/core';
import type { ApiError, ErrorCode } from '@aegis/core';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

interface Rendered {
  status: number;
  body: ApiError;
}

function render(code: ErrorCode | string, message: string, requestId: string, status: number, extra: { details?: unknown; paypalDebugId?: string | null } = {}): Rendered {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(extra.details === undefined ? {} : { details: extra.details }),
        paypalDebugId: extra.paypalDebugId ?? null,
        requestId,
      },
    },
  };
}

/**
 * One error shape for the whole API (TDD "Error shape"). A DomainError keeps its own code and status; anything else is
 * a 500 whose message is generic, because an unexpected error's text can carry SQL, a stack, or a credential. The real
 * error is logged with the request id so it can still be found.
 */
export function renderError(err: unknown, requestId: string): Rendered {
  if (err instanceof DomainError) {
    return render(err.code, err.message, requestId, HTTP_STATUS[err.code], { details: err.details, paypalDebugId: err.paypalDebugId ?? null });
  }
  if (err instanceof ZodError) {
    return render('VALIDATION', 'request did not match the expected shape', requestId, 400, {
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const fe = err as Partial<FastifyError>;
  if (typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
    const code = fe.statusCode === 429 ? 'RATE_LIMITED' : fe.statusCode === 403 ? 'FORBIDDEN' : fe.statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION';
    const message = fe.statusCode === 413 ? 'request body too large' : fe.statusCode === 429 ? 'too many requests' : (fe.message ?? 'bad request');
    return render(code, message, requestId, fe.statusCode);
  }
  return render('INTERNAL', 'internal error', requestId, 500);
}

export function installErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    const r = renderError(err, req.id);
    if (r.status >= 500) req.log.error({ err }, 'request failed');
    else req.log.info({ code: r.body.error.code, status: r.status }, 'request refused');
    void reply.status(r.status).send(r.body);
  });
  app.setNotFoundHandler((req, reply) => {
    const r = render('NOT_FOUND', `no route ${req.method} ${req.url.split('?')[0]}`, req.id, 404);
    void reply.status(404).send(r.body);
  });
}
