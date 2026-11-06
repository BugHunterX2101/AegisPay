export type ErrorCode =
  | 'VALIDATION'
  | 'MANDATE_INVALID'
  | 'MANDATE_NOT_ACTIVE'
  | 'NOT_FOUND'
  | 'GATE_FAILED'
  | 'DECISION_STALE'
  | 'AMOUNT_MISMATCH'
  | 'BAD_STATE'
  | 'SLA_PASSED'
  | 'ALREADY_CAPTURED'
  | 'ORDER_NOT_APPROVED'
  | 'CARRIER_UNKNOWN'
  | 'PROOF_GATE_FAILED'
  | 'EVIDENCE_BLOCKED'
  | 'EVIDENCE_NOT_ALLOWED'
  | 'WRITES_DISABLED'
  | 'AGENT_UNAVAILABLE'
  | 'PAYPAL_ERROR'
  | 'CONCURRENT_UPDATE'
  | 'FORBIDDEN'
  | 'INTERNAL';

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  MANDATE_INVALID: 422,
  MANDATE_NOT_ACTIVE: 409,
  NOT_FOUND: 404,
  GATE_FAILED: 409,
  DECISION_STALE: 409,
  AMOUNT_MISMATCH: 409,
  BAD_STATE: 409,
  SLA_PASSED: 409,
  ALREADY_CAPTURED: 409,
  ORDER_NOT_APPROVED: 409,
  CARRIER_UNKNOWN: 400,
  PROOF_GATE_FAILED: 409,
  EVIDENCE_BLOCKED: 409,
  EVIDENCE_NOT_ALLOWED: 409,
  WRITES_DISABLED: 503,
  AGENT_UNAVAILABLE: 503,
  PAYPAL_ERROR: 502,
  CONCURRENT_UPDATE: 409,
  FORBIDDEN: 403,
  INTERNAL: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly paypalDebugId?: string;
  readonly paypalName?: string;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { details?: unknown; paypalDebugId?: string; paypalName?: string; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'DomainError';
    this.code = code;
    this.details = opts.details;
    this.paypalDebugId = opts.paypalDebugId;
    this.paypalName = opts.paypalName;
  }
}
