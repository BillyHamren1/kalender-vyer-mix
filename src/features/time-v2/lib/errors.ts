/** Shared Time V2 client error type (kept separate to avoid import cycles). */

export type TimeV2ClientErrorKind =
  | 'not_configured'
  | 'unreachable'
  | 'http_error'
  | 'bad_payload'
  | 'stale_revision'
  | 'stale_hash'
  | 'already_decided'
  | 'forbidden'
  | 'not_found'
  | 'upstream_missing'
  | 'gate_closed'
  | 'invalid_input';

export class TimeV2ClientError extends Error {
  kind: TimeV2ClientErrorKind;
  status?: number;
  /** Boundary error code exactly as the proxy reported it (for tests/UI). */
  code?: string;
  constructor(kind: TimeV2ClientErrorKind, message: string, status?: number, code?: string) {
    super(message);
    this.name = 'TimeV2ClientError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}
