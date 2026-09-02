/**
 * Time V2 personnel/app-account boundary — bound to the REAL Time adapter.
 *
 * Reads use `personnel.accounts`, `personnel.detail` and
 * `personnel.activationSupport`. Writes use `activation.issue` /
 * `activation.reissue` and `personnel.setAppAccess`. Planning never copies
 * passwords, sessions, tokens or roles between systems, never renders an
 * activation ticket/secret, and never triggers email delivery from here
 * (Time's issue call runs with deliver=false).
 */

import type { TimeV2PersonnelDetail, TimeV2PersonnelDirectory } from './contract';
import { TimeV2ClientError } from './errors';
import { callTimeBoundary, TIME_OPERATIONS, type TimeBoundaryOptions } from './boundary';
import { mapPersonnelDetail, mapPersonnelDirectory } from './v2Mappers';

export interface TimeV2PersonnelOptions extends TimeBoundaryOptions {
  signal?: AbortSignal;
}

export async function fetchTimeV2PersonnelDirectory(
  organizationId: string,
  opts: TimeV2PersonnelOptions = {},
): Promise<TimeV2PersonnelDirectory> {
  const env = await callTimeBoundary(TIME_OPERATIONS.personnelAccounts, {}, opts);
  return mapPersonnelDirectory(env.data, env.generatedAt);
}

export async function fetchTimeV2PersonnelDetail(
  organizationId: string,
  personnelId: string,
  opts: TimeV2PersonnelOptions = {},
): Promise<TimeV2PersonnelDetail> {
  if (!personnelId) throw new TimeV2ClientError('invalid_input', 'Personal-ID saknas.');
  const [detail, support] = await Promise.all([
    callTimeBoundary(TIME_OPERATIONS.personnelDetail, { personnelId }, opts),
    callTimeBoundary(TIME_OPERATIONS.personnelActivationSupport, { personnelId }, opts),
  ]);
  const mapped = mapPersonnelDetail(detail.data, support.data, personnelId);
  if (!mapped) throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ingen giltig personalpost.');
  return mapped;
}

/* ------------------------------- commands --------------------------------- */

export const TIME_V2_PERSONNEL_COMMANDS = {
  issueActivation: TIME_OPERATIONS.activationIssue,
  reissueActivation: TIME_OPERATIONS.activationReissue,
  setAppAccess: TIME_OPERATIONS.setAppAccess,
} as const;

export interface TimeV2PersonnelCommandResult {
  accepted: boolean;
  /** Status only. A ticket/secret is never returned to Planning. */
  appAccountState: string | null;
  activationIssuedAt: string | null;
  activationExpiresAt: string | null;
  message: string | null;
}

const SECRET_KEYS = ['oneTimeSecret', 'one_time_secret', 'secret', 'ticket', 'token', 'password', 'session', 'claimUrl'];

export function normalizePersonnelCommandResult(raw: unknown): TimeV2PersonnelCommandResult {
  const r = { ...((raw ?? {}) as Record<string, unknown>) };
  // Status fields only — the ticket's secret parts are dropped below.
  const ticket = { ...((r.ticket ?? {}) as Record<string, unknown>) } as Record<string, unknown>;
  // Defensive: never surface a secret even if Time were to return one.
  for (const k of SECRET_KEYS) { delete r[k]; delete ticket[k]; }
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    accepted: r.accepted === undefined ? r.error === undefined : r.accepted === true,
    appAccountState: s(r.accountState ?? r.state ?? (r.account as Record<string, unknown>)?.state),
    activationIssuedAt: s(r.issuedAt ?? ticket.issuedAt ?? ticket.createdAt),
    activationExpiresAt: s(r.expiresAt ?? ticket.expiresAt),
    message: s(r.message ?? r.detail),
  };
}

export interface PersonnelCommandInput {
  organizationId: string;
  personnelId: string;
}

/** Issue or reissue a disposable activation. Planning only sees its status. */
export async function issueTimeV2AppActivation(
  input: PersonnelCommandInput & { reissue?: boolean },
  opts: TimeV2PersonnelOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  if (!input.personnelId) throw new TimeV2ClientError('invalid_input', 'Personal-ID saknas.');
  const env = await callTimeBoundary(
    input.reissue ? TIME_OPERATIONS.activationReissue : TIME_OPERATIONS.activationIssue,
    {
      personnelId: input.personnelId,
      channel: 'one_time_claim',
      ttlSeconds: 3600,
      idempotencyKey: `planning:activation:${input.personnelId}:${input.reissue ? 'reissue' : 'issue'}`,
    },
    opts,
  );
  return normalizePersonnelCommandResult(env.data);
}

async function setAppAccess(
  input: PersonnelCommandInput,
  state: 'active' | 'suspended',
  opts: TimeV2PersonnelOptions,
): Promise<TimeV2PersonnelCommandResult> {
  if (!input.personnelId) throw new TimeV2ClientError('invalid_input', 'Personal-ID saknas.');
  const env = await callTimeBoundary(
    TIME_OPERATIONS.setAppAccess,
    {
      personnelId: input.personnelId,
      state,
      roles: ['time_worker'],
      idempotencyKey: `planning:app-access:${input.personnelId}:${state}`,
    },
    opts,
  );
  return normalizePersonnelCommandResult(env.data);
}

export async function suspendTimeV2AppAccess(
  input: PersonnelCommandInput,
  opts: TimeV2PersonnelOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  return setAppAccess(input, 'suspended', opts);
}

export async function reactivateTimeV2AppAccess(
  input: PersonnelCommandInput,
  opts: TimeV2PersonnelOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  return setAppAccess(input, 'active', opts);
}
