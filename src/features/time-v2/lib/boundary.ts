/**
 * Real Time boundary transport for the Planning Time V2 module.
 *
 * The browser calls Planning's own edge function `time-planning-proxy`
 * (same-origin, authenticated Planning/HUB session). That proxy holds the Time
 * system credential server-side and calls Time's deployed boundary
 * `time-planning-adapter` (`time-planning-boundary.v1` /
 * `time-planning-adapter.v2`). No cross-origin browser call and no service
 * credential ever reaches the client.
 */

import { supabase } from '@/integrations/supabase/client';
import { TimeV2ClientError, type TimeV2ClientErrorKind } from './client';

export const TIME_ADAPTER_VERSION = 'time-planning-adapter.v2' as const;
export const TIME_BOUNDARY_SCHEMA = 'time-planning-boundary.v1' as const;
export const TIME_PROXY_FUNCTION = 'time-planning-proxy' as const;

/** Operations exposed by Time's deployed manifest and used by Planning A–E. */
export const TIME_OPERATIONS = {
  manifest: 'manifest',
  status: 'status',
  personnelAccounts: 'personnel.accounts',
  personnelDetail: 'personnel.detail',
  personnelActivationSupport: 'personnel.activationSupport',
  daysQueue: 'days.queue',
  dayDetail: 'days.detail',
  dayEvidence: 'days.evidence',
  previewPayroll: 'preview.payroll',
  previewProject: 'preview.project',
  setAppAccess: 'personnel.setAppAccess',
  requestCorrection: 'review.requestCorrection',
  attestPayroll: 'attest.payroll',
  attestProject: 'attest.project',
  activationIssue: 'activation.issue',
  activationReissue: 'activation.reissue',
} as const;

export type TimeOperation = (typeof TIME_OPERATIONS)[keyof typeof TIME_OPERATIONS];

const KIND_BY_CODE: Record<string, TimeV2ClientErrorKind> = {
  not_configured: 'not_configured',
  service_not_configured: 'not_configured',
  upstream_unavailable: 'unreachable',
  unsupported_operation: 'invalid_input',
  invalid_request: 'invalid_input',
  contract_mismatch: 'bad_payload',
  unknown_subject: 'http_error',
};

export interface TimeBoundaryEnvelope<T = unknown> {
  operation: string;
  adapterVersion: string;
  generatedAt: string | null;
  data: T;
}

export interface TimeBoundaryOptions {
  /** Test seam: replace the transport without touching Supabase. */
  invoke?: (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

export function mapBoundaryError(payload: unknown, fallbackStatus?: number): TimeV2ClientError {
  const r = (payload ?? {}) as Record<string, unknown>;
  const code = typeof r.code === 'string' ? r.code : '';
  const message = typeof r.error === 'string' && r.error.trim()
    ? r.error
    : 'Time-gränsen svarade med ett fel.';
  if (fallbackStatus === 409 || code === 'stale_revision') {
    return new TimeV2ClientError(
      'stale_revision',
      'Dagen har ändrats i Time sedan du öppnade den. Läs om snapshoten och besluta mot rätt revision.',
      409,
    );
  }
  return new TimeV2ClientError(KIND_BY_CODE[code] ?? 'http_error', message, fallbackStatus);
}

/** Single call path for every Time read and command. */
export async function callTimeBoundary<T = unknown>(
  operation: TimeOperation,
  params: Record<string, unknown> = {},
  opts: TimeBoundaryOptions = {},
): Promise<TimeBoundaryEnvelope<T>> {
  const invoke =
    opts.invoke ??
    (async (body: Record<string, unknown>) =>
      supabase.functions.invoke(TIME_PROXY_FUNCTION, { body }));

  const clean: Record<string, unknown> = { operation };
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) clean[k] = v;

  let result: { data: unknown; error: unknown };
  try {
    result = await invoke(clean);
  } catch (e) {
    throw new TimeV2ClientError('unreachable', `Time-gränsen gick inte att nå: ${(e as Error)?.message ?? 'okänt fel'}`);
  }

  if (result.error) {
    const err = result.error as { context?: { status?: number }; status?: number; message?: string };
    const status = err?.context?.status ?? err?.status;
    // Supabase surfaces the JSON error body on the response when available.
    const body = (result.data ?? {}) as Record<string, unknown>;
    if (typeof body.code === 'string' || typeof body.error === 'string') {
      throw mapBoundaryError(body, status);
    }
    if (status === 409) throw mapBoundaryError({ code: 'stale_revision' }, 409);
    throw new TimeV2ClientError('unreachable', err?.message ?? 'Time-gränsen svarade inte.', status);
  }

  const env = (result.data ?? {}) as Record<string, unknown>;
  if (typeof env.code === 'string' && env.data === undefined) throw mapBoundaryError(env);
  if (env.adapterVersion !== TIME_ADAPTER_VERSION) {
    throw new TimeV2ClientError(
      'bad_payload',
      `Oväntad Time-adapterversion (${String(env.adapterVersion ?? 'okänd')}).`,
    );
  }
  return {
    operation: String(env.operation ?? operation),
    adapterVersion: TIME_ADAPTER_VERSION,
    generatedAt: typeof env.generatedAt === 'string' ? env.generatedAt : null,
    data: env.data as T,
  };
}
