/**
 * useAttestStaffDay — user attestation of a finished workday with break.
 *
 * Wraps the `attest-staff-day` Edge Function via the same dual-auth helper
 * the snapshot hooks use (mobile token preferred, Supabase JWT fallback).
 *
 * This is USER attestation only — never call admin_approve_day from here
 * and never set workdays.approved_at. Backend enforces all locking rules
 * (locked / approved days are rejected for non-admin callers).
 *
 * On success we dispatch:
 *   - 'staff-day-attested'    → snapshot/month/period hooks refresh
 *   - 'timer-state-changed'   → generic timer surfaces refresh
 */
import { useCallback, useState } from 'react';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export interface AttestStaffDayInput {
  staffId: string;
  date: string;            // YYYY-MM-DD
  breakMinutes: number;    // 0..600
  comment?: string | null;
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

    setIsSaving(true);
    setError(null);
    try {
      await callStaffSnapshotFunction('attest-staff-day', {
        staffId: input.staffId,
        date: input.date,
        breakMinutes,
        comment: input.comment ?? null,
      });
      try {
        window.dispatchEvent(new CustomEvent('staff-day-attested', {
          detail: { staffId: input.staffId, date: input.date },
        }));
        window.dispatchEvent(new CustomEvent('timer-state-changed'));
      } catch { /* ignore */ }
    } catch (err: any) {
      const message = err?.message || 'Kunde inte godkänna dagen';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { attestDay, isSaving, error };
}
