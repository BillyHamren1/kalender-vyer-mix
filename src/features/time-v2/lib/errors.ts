/** Shared Time V2 client error type (kept separate to avoid import cycles). */

export type TimeV2ClientErrorKind =
  | 'not_configured'
  | 'unreachable'
  | 'http_error'
  | 'bad_payload'
  | 'stale_revision'
  | 'invalid_input';

export class TimeV2ClientError extends Error {
  kind: TimeV2ClientErrorKind;
  status?: number;
  constructor(kind: TimeV2ClientErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'TimeV2ClientError';
    this.kind = kind;
    this.status = status;
  }
}
