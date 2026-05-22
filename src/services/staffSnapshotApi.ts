/**
 * staffSnapshotApi — calls staff snapshot edge functions with the right auth.
 *
 * Uses the mobile token (eventflow-mobile-token) when present so mobile-app
 * users authenticate the same way as workday/mobile-app-api. Falls back to
 * supabase.functions.invoke for admin/web (Supabase JWT).
 */
import { supabase } from '@/integrations/supabase/client';
import { getToken } from '@/services/mobileApiService';
import { getViewAsStaffId } from '@/services/viewAsStorage';

type SnapshotErrorCode = 'snapshot_unauthorized' | 'snapshot_failed';

function getErrorStatus(error: unknown): number | null {
  const maybeStatus = (error as { context?: { status?: number }; status?: number } | null | undefined)?.context?.status
    ?? (error as { status?: number } | null | undefined)?.status;
  return typeof maybeStatus === 'number' ? maybeStatus : null;
}

function getErrorMessage(error: unknown): string {
  return (error as { message?: string } | null | undefined)?.message ?? '';
}

function normalizeSnapshotError(error: unknown): Error {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return new Error('snapshot_unauthorized');
  }

  return new Error('snapshot_failed');
}

/**
 * Snapshot/read endpoints AND user-driven mutations (e.g. attest-staff-day)
 * share the same dual-auth path: prefer mobile token if present, otherwise
 * fall back to Supabase JWT via supabase.functions.invoke.
 */
export type StaffSnapshotFunctionName =
  | 'get-staff-day-status'
  | 'get-staff-month-status'
  | 'get-staff-time-report-period'
  | 'get-current-time-registration'
  | 'get-active-timer-status'
  | 'get-active-time-registration-status'
  | 'get-timer-time-segments'
  | 'attest-staff-day'
  | 'get-staff-presence-day'
  // Time App single-source endpoints (cache-driven):
  | 'get-mobile-staff-day-report'
  | 'get-mobile-staff-time-report-period'
  | 'get-mobile-staff-day-pings'
  | 'submit-staff-day-v3';

export async function callStaffSnapshotFunction<T>(
  name: StaffSnapshotFunctionName,
  body: Record<string, unknown>,
): Promise<T> {
  const mobileToken = getToken();
  const storedViewAs = getViewAsStaffId();
  // Only attach the admin "view-as" header when it actually matches the staff
  // we're querying. A stale viewAs value in localStorage (left over from an
  // admin session) otherwise collides with the mobile user's own requests and
  // the edge function rejects with 403 "requestedStaffId must match
  // x-view-as-staff".
  const bodyStaffId =
    (body?.staffId as string | undefined) ??
    (body?.staff_id as string | undefined) ??
    (body?.requestedStaffId as string | undefined) ??
    null;
  const viewAs = storedViewAs && (!bodyStaffId || bodyStaffId === storedViewAs)
    ? storedViewAs
    : null;
  if (mobileToken) {
    const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const apikey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!base) throw new Error('VITE_SUPABASE_URL not set');
    const res = await fetch(`${base.replace(/\/+$/, '')}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mobileToken}`,
        ...(apikey ? { apikey } : {}),
        ...(viewAs ? { 'x-view-as-staff': viewAs } : {}),
      },
      body: JSON.stringify(body),
    });
    let parsed: any = null;
    try { parsed = await res.json(); } catch { /* noop */ }
    if (!res.ok) {
      throw normalizeSnapshotError({
        status: res.status,
        message: parsed?.error || `${name} failed (HTTP ${res.status})`,
      });
    }
    if (parsed?.error) throw new Error(parsed.error);
    return parsed as T;
  }

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: viewAs ? { 'x-view-as-staff': viewAs } : undefined,
  });
  if (error) throw normalizeSnapshotError(error);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}
