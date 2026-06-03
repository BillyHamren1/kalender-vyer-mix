/**
 * useProjectDailyStaffTimeOverview
 * ============================================================================
 * React-Query-hook som hämtar:
 *   - planerade personer från personalkalendern:
 *       • Large project → large_project_team_assignments × staff_assignments
 *       • Vanlig booking → booking_staff_assignments (paginerat)
 *   - staff_day_submissions per (staff_id, datum-fönster)
 *   - project_staff_time_cost_lines — EN batchad query för
 *     (large_project_id ∪ booking_ids), dedupar på row.id
 *   - staff_members för namn
 *
 * VIKTIGT — ändringar mot tidigare version:
 *   - Backfill-side-effect (`backfill-project-staff-time-cost-lines`) är
 *     BORTTAGEN. Frontend får aldrig automatiskt skriva när en sida öppnas.
 *     Saknas cost lines visas det som diagnostik i dev — ingen write.
 *   - Per-booking Promise.all mot cost lines är BORTTAGEN. All hämtning
 *     går nu via fetchProjectStaffTimeCostSummaryForTargets — en query.
 *
 * Projektvyer får INTE läsa time_reports / location_time_entries /
 * travel_time_logs / staff_day_report_cache direkt här.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildProjectDailyStaffTimeOverview,
  type AssignedDay,
  type ApprovedRowInput,
  type DailyOverviewRow,
  type SubmissionInput,
} from '@/lib/projects/projectDailyStaffTimeOverview';
import {
  loadBookingAssignedDays,
  loadLargeProjectAssignedDays,
} from '@/lib/projects/loadProjectAssignedDays';
import { fetchProjectStaffTimeCostSummaryForTargets } from '@/services/projectStaffTimeCostLinesService';

interface Params {
  largeProjectId?: string | null;
  bookingIds: string[];
  startDate?: string | null;
  endDate?: string | null;
  enabled?: boolean;
}

interface Result {
  isLoading: boolean;
  error: Error | null;
  days: DailyOverviewRow[];
  refetch: () => void;
}

const COUNTABLE_STATUS = new Set([
  'submitted',
  'edited',
  'ai_flagged',
  'needs_user_attention',
  'needs_control',
  'approved',
  'payroll_approved',
  'corrected',
]);

export function useProjectDailyStaffTimeOverview({
  largeProjectId,
  bookingIds,
  startDate,
  endDate,
  enabled = true,
}: Params): Result {
  const enabledQuery = enabled && (!!largeProjectId || bookingIds.length > 0);

  const queryKey = [
    'project-daily-staff-time-overview',
    largeProjectId ?? null,
    [...bookingIds].sort().join(','),
    startDate ?? null,
    endDate ?? null,
  ];

  const { data, isLoading, error, refetch } = useQuery<DailyOverviewRow[]>({
    queryKey,
    enabled: enabledQuery,
    queryFn: async (): Promise<DailyOverviewRow[]> => {
      const t0 = performance.now();
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info('[useProjectDailyStaffTimeOverview] fetch', {
          largeProjectId: largeProjectId ?? null,
          bookingCount: bookingIds.length,
        });
        if (bookingIds.length > 10) {
          // eslint-disable-next-line no-console
          console.warn('[useProjectDailyStaffTimeOverview] > 10 bookingIds', bookingIds.length);
        }
      }

      // 1. Planerade personer från personalkalendern
      let assignedDays: AssignedDay[] = [];
      if (largeProjectId) {
        assignedDays = await loadLargeProjectAssignedDays(supabase as any, largeProjectId);
      } else if (bookingIds.length > 0) {
        assignedDays = await loadBookingAssignedDays(supabase as any, bookingIds);
      }

      const dateSet = new Set<string>(assignedDays.map((a) => a.date));
      const staffSet = new Set<string>(assignedDays.map((a) => a.staff_id));

      // 2. BATCHAD cost-line-fetch (LP + alla bookings i EN query, dedup på id)
      const summary = await fetchProjectStaffTimeCostSummaryForTargets({
        large_project_id: largeProjectId ?? null,
        booking_ids: bookingIds,
      });
      const approvedRows: ApprovedRowInput[] = summary.rows
        .filter((r) => r.approvalState !== 'excluded')
        .map((r) => ({
          date: r.date,
          staff_id: r.staff_id,
          minutes: r.minutes,
          cost: r.cost,
          approvalState: r.approvalState as 'approved' | 'unapproved',
          hourlyRate: r.hourly_rate,
          rateSource: r.rate_source,
          submissionStatus: r.submission_status,
          startAt: r.start_at,
          endAt: r.end_at,
        }));

      for (const r of summary.rows) {
        dateSet.add(r.date);
        staffSet.add(r.staff_id);
      }

      // 3. Submissions i fönstret
      let winStart = startDate ?? null;
      let winEnd = endDate ?? null;
      if (!winStart || !winEnd) {
        const allDates = Array.from(dateSet).sort();
        if (allDates.length > 0) {
          winStart = winStart ?? allDates[0];
          winEnd = winEnd ?? allDates[allDates.length - 1];
        }
      }

      let submissions: SubmissionInput[] = [];
      const staffIds = Array.from(staffSet);
      if (staffIds.length > 0 && winStart && winEnd) {
        const { data: subRows, error: subErr } = await supabase
          .from('staff_day_submissions')
          .select('staff_id, date, status, submitted_at')
          .in('staff_id', staffIds)
          .gte('date', winStart)
          .lte('date', winEnd)
          .limit(5000);
        if (subErr) throw subErr;
        submissions = (subRows ?? []).map((r: any) => ({
          date: String(r.date).slice(0, 10),
          staff_id: r.staff_id,
          status: r.status ?? 'draft',
          submitted_at: r.submitted_at ?? null,
        }));
      }

      // 4. Namn
      const staffNames: Record<string, string | null> = {};
      if (staffIds.length > 0) {
        const { data: staffRows } = await supabase
          .from('staff_members')
          .select('id, name')
          .in('id', staffIds);
        (staffRows ?? []).forEach((s: any) => {
          staffNames[s.id] = s.name ?? null;
        });
      }

      const result = buildProjectDailyStaffTimeOverview({
        assignedDays,
        submissions,
        approvedRows,
        staffNames,
      });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info('[useProjectDailyStaffTimeOverview] done', {
          rowCount: summary.rows.length,
          days: result.length,
          elapsedMs: Math.round(performance.now() - t0),
        });
      }
      return result;
    },
  });

  // ─── Dev-diagnostik: cost lines saknas trots countable submissions.
  // INGEN backfill, INGEN write. Backfill/projection körs server-side via
  // submit/correction/status-update eller manuellt via admin/dev-verktyg.
  const warnedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!enabledQuery || !data) return;
    const fingerprint = queryKey.join('::');
    if (warnedRef.current === fingerprint) return;

    const hasCountableSubmission = data.some((d) =>
      d.rows.some(
        (r) => r.submissionStatus && COUNTABLE_STATUS.has(r.submissionStatus),
      ),
    );
    const hasAnyCostLine = data.some((d) => d.totals.totalMinutes > 0);
    if (hasCountableSubmission && !hasAnyCostLine) {
      warnedRef.current = fingerprint;
      // eslint-disable-next-line no-console
      console.warn(
        '[useProjectDailyStaffTimeOverview] countable submissions men 0 cost lines.' +
          ' Kör projection server-side (rebuild-project-time-projection / backfill).' +
          ' Frontend triggar INTE backfill automatiskt.',
        { largeProjectId, bookingCount: bookingIds.length },
      );
    }
  }, [data, enabledQuery, largeProjectId, bookingIds, queryKey]);

  return useMemo(
    () => ({
      isLoading,
      error: (error as Error) ?? null,
      days: data ?? [],
      refetch: () => void refetch(),
    }),
    [isLoading, error, data, refetch],
  );
}
