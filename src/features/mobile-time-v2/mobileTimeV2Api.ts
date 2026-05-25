/**
 * Time v2 — thin frontend client for the GPS Day View edge functions.
 *
 * Only allowed endpoints:
 *   - get-mobile-gps-day-view
 *   - submit-mobile-gps-day-v2
 *
 * Dual auth: prefers the mobile token (eventflow-mobile-token) and falls
 * back to Supabase JWT via supabase.functions.invoke. Mirrors the pattern
 * in staffSnapshotApi but lives in this isolated feature so the module
 * never imports from legacy mobile-time code paths.
 */
import { supabase } from '@/integrations/supabase/client';
import { getToken } from '@/services/mobileApiService';
import type {
  MobileGpsDayView,
  SubmitMobileGpsDayV2Input,
  SubmitMobileGpsDayV2Result,
} from './types';

type V2FunctionName = 'get-mobile-gps-day-view' | 'submit-mobile-gps-day-v2';

async function callV2<T>(name: V2FunctionName, body: Record<string, unknown>): Promise<T> {
  const mobileToken = getToken();

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
      },
      body: JSON.stringify(body),
    });
    let parsed: any = null;
    try { parsed = await res.json(); } catch { /* noop */ }
    if (!res.ok) {
      throw new Error(parsed?.error || `${name} failed (HTTP ${res.status})`);
    }
    if (parsed?.error) throw new Error(parsed.error);
    return parsed as T;
  }

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `${name} failed`);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export interface GetMobileGpsDayViewInput {
  staffId: string;
  date: string; // YYYY-MM-DD
}

export function getMobileGpsDayView(
  input: GetMobileGpsDayViewInput,
): Promise<MobileGpsDayView> {
  return callV2<MobileGpsDayView>('get-mobile-gps-day-view', {
    staffId: input.staffId,
    date: input.date,
  });
}

export function submitMobileGpsDayV2(
  input: SubmitMobileGpsDayV2Input,
): Promise<SubmitMobileGpsDayV2Result> {
  return callV2<SubmitMobileGpsDayV2Result>('submit-mobile-gps-day-v2', {
    staffId: input.staffId,
    date: input.date,
    userComment: input.userComment ?? null,
    manualOverrides: input.manualOverrides ?? [],
    expectedSourceSnapshotId: input.expectedSourceSnapshotId ?? null,
  });
}
