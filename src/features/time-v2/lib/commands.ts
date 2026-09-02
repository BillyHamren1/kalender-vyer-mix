/**
 * Versioned Time V2 command boundary (write path).
 *
 * Planning may only issue the Time-owned review commands below. This module
 * can never write Planning source records (bookings, projects, customers,
 * locations, schedules, assignments) and never publishes payroll or project
 * output to any external system — it posts a decision to Time and Time stays
 * the owner of the immutable submission snapshot.
 *
 * Every command carries the exact submission revision it was decided against.
 * Time rejects a stale revision (409) and the UI recovers truthfully instead
 * of retrying blindly.
 */

import { TIME_V2_CONTRACT_VERSION } from './contract';
import { getTimeV2BaseUrl, TimeV2ClientError } from './client';

export const TIME_V2_COMMANDS = {
  requestCorrection: 'request-correction',
  attestPayroll: 'attest-payroll',
  attestProject: 'attest-project',
} as const;

export type TimeV2CommandKey = keyof typeof TIME_V2_COMMANDS;

export function timeV2CommandPath(key: TimeV2CommandKey): string {
  return `/api/time/${TIME_V2_CONTRACT_VERSION}/commands/${TIME_V2_COMMANDS[key]}`;
}

export interface TimeV2CommandBase {
  organizationId: string;
  submissionId: string;
  /** Revision the admin actually saw. Required for stale-revision detection. */
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

export interface TimeV2CommandOptions {
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const normalizeResult = (raw: unknown): TimeV2CommandResult => {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    accepted: r.accepted === undefined ? true : r.accepted === true,
    revision: typeof r.revision === 'number' && Number.isFinite(r.revision) ? r.revision : 0,
    state: typeof r.state === 'string' && r.state.trim() ? r.state : null,
    message: typeof r.message === 'string' && r.message.trim() ? r.message : null,
  };
};

async function postCommand(
  key: TimeV2CommandKey,
  body: Record<string, unknown>,
  opts: TimeV2CommandOptions,
): Promise<TimeV2CommandResult> {
  const baseUrl = opts.baseUrl ?? getTimeV2BaseUrl();
  if (!baseUrl) {
    throw new TimeV2ClientError(
      'not_configured',
      'Time-källan är inte konfigurerad (VITE_TIME_V2_BASE_URL saknas).',
    );
  }
  const url = baseUrl.replace(/\/+$/, '') + timeV2CommandPath(key);
  const doFetch = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-EventFlow-Contract-Version': TIME_V2_CONTRACT_VERSION,
        'X-EventFlow-Consumer': 'planning-time-v2',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    throw new TimeV2ClientError('unreachable', `Time-källan gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`);
  }

  if (res.status === 409) {
    throw new TimeV2ClientError(
      'stale_revision',
      'Dagen har ändrats i Time sedan du öppnade den. Läs om snapshoten och besluta mot rätt revision.',
      409,
    );
  }
  if (!res.ok) {
    throw new TimeV2ClientError('http_error', `Time-källan avvisade kommandot (${res.status}).`, res.status);
  }

  try {
    return normalizeResult(await res.json());
  } catch {
    throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ogiltigt svar på kommandot.');
  }
}

export async function requestTimeV2Correction(
  input: RequestCorrectionInput,
  opts: TimeV2CommandOptions = {},
): Promise<TimeV2CommandResult> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new TimeV2ClientError('invalid_input', 'En synlig motivering krävs för korrigeringsbegäran.');
  }
  return postCommand(
    'requestCorrection',
    {
      organization_id: input.organizationId,
      submission_id: input.submissionId,
      expected_revision: input.expectedRevision,
      reason,
    },
    opts,
  );
}

export async function attestTimeV2Payroll(
  input: TimeV2CommandBase,
  opts: TimeV2CommandOptions = {},
): Promise<TimeV2CommandResult> {
  return postCommand(
    'attestPayroll',
    {
      organization_id: input.organizationId,
      submission_id: input.submissionId,
      expected_revision: input.expectedRevision,
    },
    opts,
  );
}

export async function attestTimeV2Project(
  input: TimeV2CommandBase,
  opts: TimeV2CommandOptions = {},
): Promise<TimeV2CommandResult> {
  return postCommand(
    'attestProject',
    {
      organization_id: input.organizationId,
      submission_id: input.submissionId,
      expected_revision: input.expectedRevision,
    },
    opts,
  );
}
