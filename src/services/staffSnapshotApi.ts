/**
 * staffSnapshotApi — calls staff snapshot edge functions with the right auth.
 *
 * Uses the mobile token (eventflow-mobile-token) when present so mobile-app
 * users authenticate the same way as workday/mobile-app-api. Falls back to
 * supabase.functions.invoke for admin/web (Supabase JWT).
 */
import { supabase } from '@/integrations/supabase/client';
import { getToken } from '@/services/mobileApiService';

export async function callStaffSnapshotFunction<T>(
  name: 'get-staff-day-status' | 'get-staff-month-status' | 'get-staff-time-report-period' | 'get-current-time-registration',
  body: Record<string, unknown>,
): Promise<T> {
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
    if (!res.ok) throw new Error(parsed?.error || `${name} failed (HTTP ${res.status})`);
    if (parsed?.error) throw new Error(parsed.error);
    return parsed as T;
  }

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}
