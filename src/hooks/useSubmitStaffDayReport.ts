/**
 * useSubmitStaffDayReport — användarens insändning av en dagrapport i TIME.
 *
 * Externt rent rapporteringsspråk ("submit day report"). Internt delegerar
 * den tills vidare till `useAttestStaffDay` som anropar samma backend
 * (`submit-staff-day-v3` → staff_day_submissions). Inget attest-/godkänd-
 * /payroll-språk exponeras till UI:t.
 */
import { useCallback } from 'react';
import { useAttestStaffDay } from '@/hooks/useAttestStaffDay';

export interface SubmitStaffDayReportInput {
  staffId: string;
  date: string;
  breakMinutes: number;
  comment?: string | null;
  requestedStartAt?: string | null;
  requestedEndAt?: string | null;
}

export interface UseSubmitStaffDayReportResult {
  submitDayReport: (input: SubmitStaffDayReportInput) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

export function useSubmitStaffDayReport(): UseSubmitStaffDayReportResult {
  const { attestDay, isSaving, error } = useAttestStaffDay();

  const submitDayReport = useCallback(
    (input: SubmitStaffDayReportInput) => attestDay(input),
    [attestDay],
  );

  return { submitDayReport, isSaving, error };
}
