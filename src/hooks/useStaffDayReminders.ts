/**
 * useStaffDayReminders — Lager 5.6
 *
 * Hämtar påminnelser från `get-staff-day-reminders` (read-only). Anti-spam
 * sköts klientsidan via localStorage: en dismissad reminder visas inte
 * igen förrän TTL gått ut (default 6 h).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StaffDayReminder {
  kind: 'submit_yesterday_pending' | 'submit_today_pending' | 'confirm_edits';
  date: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  dedupeKey: string;
  linkPath: string;
}

const DISMISS_TTL_MS = 6 * 60 * 60 * 1000; // 6 timmar
const STORAGE_KEY = 'staff_day_reminders.dismissed.v1';

interface DismissMap { [dedupeKey: string]: number /* expiresAt ms */ }

function loadDismissed(): DismissMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissMap;
    const now = Date.now();
    const cleaned: DismissMap = {};
    for (const [k, exp] of Object.entries(parsed)) {
      if (typeof exp === 'number' && exp > now) cleaned[k] = exp;
    }
    return cleaned;
  } catch { return {}; }
}

function saveDismissed(map: DismissMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

interface Args {
  staffId: string | null | undefined;
  /** Polla med intervall (ms). Default: 5 min. 0 = ingen polling. */
  pollMs?: number;
  disabled?: boolean;
}

export function useStaffDayReminders({ staffId, pollMs = 5 * 60_000, disabled }: Args) {
  const [reminders, setReminders] = useState<StaffDayReminder[]>([]);
  const [dismissedMap, setDismissedMap] = useState<DismissMap>(() => loadDismissed());
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (disabled || !staffId) { setReminders([]); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-staff-day-reminders', {
        body: { staffId },
      });
      if (error) throw error;
      const list = Array.isArray((data as any)?.reminders) ? (data as any).reminders : [];
      setReminders(list as StaffDayReminder[]);
    } catch (e) {
      console.warn('[useStaffDayReminders] load failed', e);
      setReminders([]);
    } finally {
      setIsLoading(false);
    }
  }, [staffId, disabled]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!pollMs || disabled) return;
    const id = window.setInterval(() => { void load(); }, pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs, disabled]);

  const dismiss = useCallback((dedupeKey: string) => {
    const next = { ...loadDismissed(), [dedupeKey]: Date.now() + DISMISS_TTL_MS };
    saveDismissed(next);
    setDismissedMap(next);
  }, []);

  const visible = reminders.filter((r) => !dismissedMap[r.dedupeKey]);
  return { reminders: visible, allReminders: reminders, isLoading, dismiss, refresh: load };
}
