/**
 * useSubmitStaffDayReport — användarens insändning av en dagrapport i TIME.
 *
 * Rent rapporteringsspråk: anropar `submit-staff-day-v3` direkt via
 * callStaffSnapshotFunction och dispatchar endast neutrala events
 * (`staff-day-submitted`, `timer-state-changed`). Inget attest-/payroll-
 * språk exponeras.
 *
 * Payloaden speglar submit-staff-day-v3:
 *   requestedStartAt / requestedEndAt / breakMinutes / comment
 *   userEdits[] — explicita användarredigeringar (Lager 5.3)
 *   displayTimelineSnapshot[] — vad användaren SÅG när hen skickade in,
 *     för revision och AI-validering. Mobilen bygger ALDRIG om dagen.
 */
import { useCallback, useState } from 'react';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export interface SubmitStaffDayUserEdit {
  editId: string;
  sourceDisplayBlockId: string | null;
  editType:
    | 'change_block_start'
    | 'change_block_end'
    | 'link_block_to_project'
    | 'mark_supplier_as_pickup'
    | 'mark_supplier_as_dropoff'
    | 'link_address_to_project'
    | 'change_workday_end'
    | 'add_block_comment';
  previousValue: unknown;
  newValue: unknown;
  userReason: string | null;
  createdAt: string;
}

export interface SubmitStaffDayDisplayBlock {
  blockId: string;
  startAtIso: string;
  endAtIso: string | null;
  allocationType: string;
  targetType?: string | null;
  targetId?: string | null;
  label?: string | null;
  [key: string]: unknown;
}

export interface SubmitStaffDayReportInput {
  staffId: string;
  date: string;            // YYYY-MM-DD
  breakMinutes: number;    // 0..600
  comment?: string | null;
  requestedStartAt?: string | null;
  requestedEndAt?: string | null;
  userEdits?: SubmitStaffDayUserEdit[];
  displayTimelineSnapshot?: SubmitStaffDayDisplayBlock[];
}

export interface UseSubmitStaffDayReportResult {
  submitDayReport: (input: SubmitStaffDayReportInput) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

export function useSubmitStaffDayReport(): UseSubmitStaffDayReportResult {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitDayReport = useCallback(async (input: SubmitStaffDayReportInput) => {
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
        userEdits: input.userEdits ?? [],
        displayTimelineSnapshot: input.displayTimelineSnapshot ?? [],
      });
      try {
        const detail = { staffId: input.staffId, date: input.date };
        window.dispatchEvent(new CustomEvent('staff-day-submitted', { detail }));
        window.dispatchEvent(new CustomEvent('timer-state-changed'));
      } catch { /* ignore */ }
    } catch (err: any) {
      const message = err?.message || 'Kunde inte skicka in dagrapporten';
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { submitDayReport, isSaving, error };
}
