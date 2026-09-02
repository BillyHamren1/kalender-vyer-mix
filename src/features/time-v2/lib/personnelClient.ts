/**
 * Time V2 personnel/app-account boundary (Package D).
 *
 * Read path is GET-only against Time's versioned personnel contract.
 * Write path only issues Time-owned account support commands. Planning never
 * copies passwords, sessions, tokens or roles, never renders an activation
 * ticket/secret, and never triggers email side effects from here.
 */

import {
  normalizePersonnelDetail,
  normalizePersonnelDirectory,
  timeV2PersonnelPath,
  TIME_V2_CONTRACT_VERSION,
  type TimeV2PersonnelDetail,
  type TimeV2PersonnelDirectory,
  type TimeV2PersonnelEndpointKey,
} from './contract';
import { getTimeV2BaseUrl, TimeV2ClientError, type TimeV2ClientOptions } from './client';

const HEADERS = {
  Accept: 'application/json',
  'X-EventFlow-Contract-Version': TIME_V2_CONTRACT_VERSION,
  'X-EventFlow-Consumer': 'planning-time-v2',
};

function requireBaseUrl(opts: { baseUrl?: string | null }): string {
  const baseUrl = opts.baseUrl ?? getTimeV2BaseUrl();
  if (!baseUrl) {
    throw new TimeV2ClientError(
      'not_configured',
      'Time-källan är inte konfigurerad (VITE_TIME_V2_BASE_URL saknas).',
    );
  }
  return baseUrl.replace(/\/+$/, '');
}

async function readPersonnel(
  key: TimeV2PersonnelEndpointKey,
  params: Record<string, string | undefined>,
  opts: TimeV2ClientOptions,
): Promise<unknown> {
  const base = requireBaseUrl(opts);
  const url = new URL(base + timeV2PersonnelPath(key));
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url.toString(), { method: 'GET', headers: HEADERS, signal: opts.signal });
  } catch (e) {
    throw new TimeV2ClientError('unreachable', `Time-källan gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`);
  }
  if (!res.ok) throw new TimeV2ClientError('http_error', `Time-källan svarade ${res.status}.`, res.status);
  try {
    return await res.json();
  } catch {
    throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ogiltig JSON.');
  }
}

export async function fetchTimeV2PersonnelDirectory(
  organizationId: string,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PersonnelDirectory> {
  return normalizePersonnelDirectory(
    await readPersonnel('personnelDirectory', { organization_id: organizationId }, opts),
  );
}

export async function fetchTimeV2PersonnelDetail(
  organizationId: string,
  personnelId: string,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PersonnelDetail> {
  const detail = normalizePersonnelDetail(
    await readPersonnel(
      'personnelDetail',
      { organization_id: organizationId, personnel_id: personnelId },
      opts,
    ),
  );
  if (!detail) throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ingen giltig personalpost.');
  return detail;
}

/* ------------------------------- commands --------------------------------- */

export const TIME_V2_PERSONNEL_COMMANDS = {
  issueActivation: 'issue-app-activation',
  suspendAppAccess: 'suspend-app-access',
  reactivateAppAccess: 'reactivate-app-access',
} as const;

export type TimeV2PersonnelCommandKey = keyof typeof TIME_V2_PERSONNEL_COMMANDS;

export function timeV2PersonnelCommandPath(key: TimeV2PersonnelCommandKey): string {
  return `/api/time/${TIME_V2_CONTRACT_VERSION}/commands/${TIME_V2_PERSONNEL_COMMANDS[key]}`;
}

export interface TimeV2PersonnelCommandResult {
  accepted: boolean;
  /** Status only. A ticket/secret is never returned to Planning. */
  appAccountState: string | null;
  activationIssuedAt: string | null;
  activationExpiresAt: string | null;
  message: string | null;
}

const SECRET_KEYS = ['activation_ticket', 'activationTicket', 'ticket', 'secret', 'token', 'password', 'session'];

function normalizeCommandResult(raw: unknown): TimeV2PersonnelCommandResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  // Defensive: never surface a secret even if Time were to return one.
  for (const k of SECRET_KEYS) delete r[k];
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    accepted: r.accepted === undefined ? true : r.accepted === true,
    appAccountState: s(r.app_account_state ?? r.appAccountState ?? r.state),
    activationIssuedAt: s(r.activation_issued_at ?? r.activationIssuedAt),
    activationExpiresAt: s(r.activation_expires_at ?? r.activationExpiresAt),
    message: s(r.message),
  };
}

async function postPersonnelCommand(
  key: TimeV2PersonnelCommandKey,
  body: Record<string, unknown>,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  const base = requireBaseUrl(opts);
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(base + timeV2PersonnelCommandPath(key), {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    throw new TimeV2ClientError('unreachable', `Time-källan gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`);
  }
  if (res.status === 409) {
    throw new TimeV2ClientError('stale_revision', 'Appkontots status har ändrats i Time. Läs om personalposten.', 409);
  }
  if (!res.ok) {
    throw new TimeV2ClientError('http_error', `Time-källan avvisade kommandot (${res.status}).`, res.status);
  }
  try {
    return normalizeCommandResult(await res.json());
  } catch {
    throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ogiltigt svar på kommandot.');
  }
}

export interface PersonnelCommandInput {
  organizationId: string;
  personnelId: string;
}

/** Issue or reissue a disposable activation. Planning only sees its status. */
export async function issueTimeV2AppActivation(
  input: PersonnelCommandInput & { reissue?: boolean },
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  if (!input.personnelId) throw new TimeV2ClientError('invalid_input', 'Personal-ID saknas.');
  return postPersonnelCommand(
    'issueActivation',
    {
      organization_id: input.organizationId,
      personnel_id: input.personnelId,
      reissue: input.reissue === true,
      // Explicitly no email side effects from Planning.
      send_email: false,
    },
    opts,
  );
}

export async function suspendTimeV2AppAccess(
  input: PersonnelCommandInput,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  return postPersonnelCommand(
    'suspendAppAccess',
    { organization_id: input.organizationId, personnel_id: input.personnelId },
    opts,
  );
}

export async function reactivateTimeV2AppAccess(
  input: PersonnelCommandInput,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PersonnelCommandResult> {
  return postPersonnelCommand(
    'reactivateAppAccess',
    { organization_id: input.organizationId, personnel_id: input.personnelId },
    opts,
  );
}
