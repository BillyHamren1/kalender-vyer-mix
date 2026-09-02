/**
 * Time V2 command boundary (write path) — bound to the REAL Time adapter.
 *
 * Commands go through Planning's same-origin proxy to Time's deployed
 * operations `review.requestCorrection`, `attest.payroll` and `attest.project`.
 * Planning never writes its own source records (bookings, projects, customers,
 * locations, schedules, assignments) and never publishes payroll or project
 * output externally — Time owns the immutable submission snapshot.
 *
 * Each command carries the exact revision the admin saw, expressed through the
 * boundary's own idempotency key. A rejected/stale decision surfaces truthfully
 * instead of retrying blindly.
 */

import { TimeV2ClientError } from './errors';
import { callTimeBoundary, TIME_OPERATIONS, type TimeBoundaryOptions } from './boundary';

export const TIME_V2_COMMANDS = {
  requestCorrection: TIME_OPERATIONS.requestCorrection,
  attestPayroll: TIME_OPERATIONS.attestPayroll,
  attestProject: TIME_OPERATIONS.attestProject,
} as const;

export type TimeV2CommandKey = keyof typeof TIME_V2_COMMANDS;

export interface TimeV2CommandBase {
  organizationId: string;
  submissionId: string;
  /** Revision the admin actually saw. Used for idempotency + stale detection. */
  expectedRevision: number;
}

export interface RequestCorrectionInput extends TimeV2CommandBase {
  reason: string;
}

export interface TimeV2CommandResult {
  accepted: boolean;
  /** Revision Time reports after applying the command. */
  revision: number;
  state: string | null;
  message: string | null;
}

export interface TimeV2CommandOptions extends TimeBoundaryOptions {
  signal?: AbortSignal;
}

export function timeV2IdempotencyKey(input: TimeV2CommandBase, key: TimeV2CommandKey): string {
  return `planning:${TIME_V2_COMMANDS[key]}:${input.submissionId}:r${input.expectedRevision}`;
}

const normalizeResult = (raw: unknown, fallbackRevision: number): TimeV2CommandResult => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const nested = (r.submission ?? r.day ?? {}) as Record<string, unknown>;
  const numberOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const strOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    accepted: r.accepted === undefined ? r.error === undefined : r.accepted === true,
    revision: numberOf(r.version ?? r.revision ?? nested.version) ?? fallbackRevision,
    state: strOf(r.state ?? nested.state ?? r.decision),
    message: strOf(r.message ?? r.detail),
  };
};

async function runCommand(
  key: TimeV2CommandKey,
  input: TimeV2CommandBase,
  params: Record<string, unknown>,
  opts: TimeV2CommandOptions,
): Promise<TimeV2CommandResult> {
  const env = await callTimeBoundary(
    TIME_V2_COMMANDS[key],
    { submissionId: input.submissionId, idempotencyKey: timeV2IdempotencyKey(input, key), ...params },
    opts,
  );
  return normalizeResult(env.data, input.expectedRevision);
}

export async function requestTimeV2Correction(
  input: RequestCorrectionInput,
  opts: TimeV2CommandOptions = {},
): Promise<TimeV2CommandResult> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new TimeV2ClientError('invalid_input', 'En synlig motivering krävs för korrigeringsbegäran.');
  }
  return runCommand('requestCorrection', input, { reason }, opts);
}

export async function attestTimeV2Payroll(
  input: TimeV2CommandBase,
  opts: TimeV2CommandOptions = {},
): Promise<TimeV2CommandResult> {
  return runCommand('attestPayroll', input, { decision: 'approved' }, opts);
}

export async function attestTimeV2Project(
  input: TimeV2CommandBase,
  opts: TimeV2CommandOptions = {},
): Promise<TimeV2CommandResult> {
  return runCommand('attestProject', input, { decision: 'approved' }, opts);
}
