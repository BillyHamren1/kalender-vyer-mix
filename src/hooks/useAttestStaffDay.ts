/**
 * useAttestStaffDay — user submission of a workday (manual or system-suggested).
 *
 * Calls `submit-staff-day-v3` via the dual-auth helper. Writes ONLY to
 * staff_day_submissions — never touches workdays / time_reports /
 * location_time_entries / travel_time_logs / day_attestations.
 *
 * On success we dispatch (kept for back-compat with snapshot/month/period
 * hooks and timer surfaces):
 *   - 'staff-day-attested'
 *   - 'staff-day-submitted'
 *   - 'timer-state-changed'
 */
import { useCallback, useState } from 'react';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export interface AttestStaffDayInput {
  staffId: string;
  date: string;            // YYYY-MM-DD
  breakMinutes: number;    // 0..600
  comment?: string | null;
  /** ISO timestamp; user's adjusted start time for the day (Stockholm local → ISO). */
  requestedStartAt?: string | null;
  /** ISO timestamp; user's adjusted end time for the day. */
  requestedEndAt?: string | null;
}

interface AttestStaffDayResult {
  attestDay: (input: AttestStaffDayInput) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

export function useAttestStaffDay(): AttestStaffDayResult {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attestDay = useCallback(async (input: AttestStaffDayInput) => {
    if (!input.staffId) throw new Error('staffId krävs');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Ogiltigt datum');
    const breakMinutes = Math.round(Number(input.breakMinutes));
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) {
      throw new Error('Rast måste vara mellan 0 och 600 minuter');
    }
    if (input.requestedStartAt && input.requestedEndAt) {
      const a = Date.parse(input.requestedStartAt);
      const b = Date.parse(input.requestedEndAt);
      if (Number.isFinite(a) && Number.isFinite(b) && a >= b) {
        throw new Error('Starttid måste vara före sluttid');
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      await callStaffSnapshotFunction('submit-staff-day-v3', {
        staffId: input.staffId,
        date: input.date,
        breakMinutes,
        comment: input.comment ?? null,
        requestedStartAt: input.requestedStartAt ?? null,
        requestedEndAt: input.requestedEndAt ?? null,
      });
      try {
        const detail = { staffId: input.staffId, date: input.date };
        window.dispatchEvent(new CustomEvent('staff-day-attested', { detail }));
        window.dispatchEvent(new CustomEvent('staff-day-submitted', { detail }));
        window.dispatchEvent(new CustomEvent('timer-state-changed'));
      } catch { /* ignore */ }
    } catch (err: any) {
      const message = err?.message || 'Kunde inte skicka in dagen';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { attestDay, isSaving, error };
}
