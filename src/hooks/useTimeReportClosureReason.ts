import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ClosureKind = 'manual_mobile' | 'manual_admin' | 'manual_staff_edit' | 'auto_watchdog' | 'unknown';

export interface ClosureReason {
  kind: ClosureKind;
  /** Short label shown as the headline in the tooltip. */
  label: string;
  /** Long-form details shown beneath the label. */
  detail: string;
  /** When the closure happened (ISO), if known. */
  at: string | null;
  /** Who performed the closure, if known. */
  byName?: string | null;
}

interface Args {
  timeReportId: string | null | undefined;
  staffId: string | null | undefined;
  reportDate: string | null | undefined;
  /** Only fetch when the session is actually closed. */
  enabled: boolean;
}

/**
 * Resolve *why* a time_reports row was closed:
 *  1. `time_report_edit_log` rows where end_time was set from null → manual edit
 *     (admin or staff, depending on `edited_by_type`).
 *  2. `workday_flags` of type `auto_closed_report` / `auto_closed_overnight` for
 *     this staff+date → watchdog auto-close.
 *  3. Fallback: stopped in the mobile app by the staff member.
 */
export function useTimeReportClosureReason({ timeReportId, staffId, reportDate, enabled }: Args) {
  return useQuery({
    queryKey: ['time-report-closure-reason', timeReportId, staffId, reportDate],
    enabled: enabled && !!timeReportId && !!staffId && !!reportDate,
    staleTime: 60_000,
    queryFn: async (): Promise<ClosureReason> => {
      const [editLogRes, flagsRes] = await Promise.all([
        supabase
          .from('time_report_edit_log')
          .select('edited_by_type, edited_by_name, previous_values, new_values, created_at')
          .eq('time_report_id', timeReportId as string)
          .order('created_at', { ascending: false }),
        supabase
          .from('workday_flags')
          .select('flag_type, title, description, created_at, context')
          .eq('staff_id', staffId as string)
          .eq('flag_date', reportDate as string)
          .in('flag_type', ['auto_closed_report', 'auto_closed_overnight']),
      ]);

      // 1. Manual edit that set end_time
      const closingEdit = (editLogRes.data || []).find((row: any) => {
        const prevEnd = row.previous_values?.end_time ?? null;
        const newEnd = row.new_values?.end_time ?? null;
        return !prevEnd && !!newEnd;
      });
      if (closingEdit) {
        const isAdmin = closingEdit.edited_by_type === 'admin';
        return {
          kind: isAdmin ? 'manual_admin' : 'manual_staff_edit',
          label: isAdmin ? 'Stängd manuellt av admin' : 'Stängd manuellt av personalen',
          detail: `${closingEdit.edited_by_name || 'Okänd'} satte sluttid via ${
            isAdmin ? 'admin-vyn' : 'mobilappen (efterhand)'
          }.`,
          at: closingEdit.created_at,
          byName: closingEdit.edited_by_name,
        };
      }

      // 2. Watchdog auto-close
      const autoFlag = (flagsRes.data || []).find((f: any) => f.flag_type === 'auto_closed_report')
        ?? (flagsRes.data || []).find((f: any) => f.flag_type === 'auto_closed_overnight');
      if (autoFlag) {
        return {
          kind: 'auto_watchdog',
          label: 'Auto-stängd av systemet',
          detail:
            autoFlag.description ||
            'Tidrapporten låg öppen för länge och stängdes automatiskt av watchdog-jobbet (close-stale-workday-entries).',
          at: autoFlag.created_at,
          byName: 'Watchdog',
        };
      }

      // 3. Fallback: stopped in the mobile app (no edit log entry exists for the
      // initial mobile stop because the row is created with end_time set).
      return {
        kind: 'manual_mobile',
        label: 'Stoppad i mobilen',
        detail: 'Personalen tryckte själv på "Avsluta aktivitet" / "Avsluta dagen" i mobilappen.',
        at: null,
      };
    },
  });
}
