/**
 * workdayApi — thin client for the `workday` edge function.
 *
 * Re-uses the same auth token mechanism as mobile-app-api (token stored
 * by MobileAuthContext in localStorage as `eventflow-mobile-token`).
 */
const TOKEN_KEY = 'eventflow-mobile-token';

export interface WorkdayRecord {
  id: string;
  organization_id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
  ended_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StartWorkdayInput {
  startedAtIso?: string;
  notes?: string;
}
export interface EndWorkdayInput {
  endedAtIso?: string;
  notes?: string;
}

interface RawResponse {
  workday: WorkdayRecord | null;
  created?: boolean;
  updated?: boolean;
  alreadyClosed?: boolean;
  error?: string;
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function endpoint(): string {
  // VITE_SUPABASE_URL is auto-injected by the platform.
  const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error('VITE_SUPABASE_URL not set');
  return `${base.replace(/\/+$/, '')}/functions/v1/workday`;
}

async function call(action: 'start' | 'end' | 'current', payload: Record<string, unknown> = {}): Promise<RawResponse> {
  const token = getToken();
  if (!token) throw new Error('No mobile auth token');
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  let body: RawResponse | null = null;
  try {
    body = (await res.json()) as RawResponse;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(body?.error || `workday ${action} failed (HTTP ${res.status})`);
  }
  return body || { workday: null };
}

export const workdayApi = {
  current: () => call('current'),
  start: (input: StartWorkdayInput = {}) => call('start', input as Record<string, unknown>),
  end: (input: EndWorkdayInput = {}) => call('end', input as Record<string, unknown>),
};
