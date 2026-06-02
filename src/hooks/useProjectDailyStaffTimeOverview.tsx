/**
 * useProjectDailyStaffTimeOverview
 * ============================================================================
 * React-Query-hook som hämtar:
 *   - planerade personer från personalkalendern:
 *       • Large project → large_project_team_assignments × staff_assignments
 *       • Vanlig booking → booking_staff_assignments (paginerat)
 *   - staff_day_submissions per (staff_id, datum-fönster)
 *   - project_staff_time_cost_lines (LP + bookings, dedup på row.id)
 *   - staff_members för namn
 *
 * Sidoeffekt: om det finns countable submissions men 0 byggda cost lines
 * triggas en engångs-backfill (`backfill-project-staff-time-cost-lines`)
 * och hooken refetchas.
 *
 * Inga skrivningar mot time_reports/workdays/LTE/travel/GPS.
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
import { fetchApprovedProjectStaffTimeCostSummary } from '@/services/projectStaffTimeCostLinesService';

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
      // 1. Planerade personer från personalkalendern
      let assignedDays: AssignedDay[] = [];
      if (largeProjectId) {
        assignedDays = await loadLargeProjectAssignedDays(supabase as any, largeProjectId);
      } else if (bookingIds.length > 0) {
        assignedDays = await loadBookingAssignedDays(supabase as any, bookingIds);
      }

      const dateSet = new Set<string>(assignedDays.map((a) => a.date));
      const staffSet = new Set<string>(assignedDays.map((a) => a.staff_id));

      // 2. Godkända/oattesterade cost lines
      const approvedSummaries = await Promise.all([
        largeProjectId
          ? fetchApprovedProjectStaffTimeCostSummary({ large_project_id: largeProjectId })
          : Promise.resolve(null),
        ...bookingIds.map((bId) =>
          fetchApprovedProjectStaffTimeCostSummary({ booking_id: bId }),
        ),
      ]);
      const seenIds = new Set<string>();
      const approvedRows: ApprovedRowInput[] = [];
      for (const sum of approvedSummaries) {
        if (!sum) continue;
        for (const r of sum.rows) {
          const k = `__id__:${(r as any).id}`;
          if (seenIds.has(k)) continue;
          seenIds.add(k);
          approvedRows.push({
            date: r.date,
            staff_id: r.staff_id,
            minutes: r.minutes,
            cost: r.cost,
            approvalState: r.approvalState,
            hourlyRate: r.hourly_rate,
            rateSource: r.rate_source,
            submissionStatus: r.submission_status,
            startAt: r.start_at,
            endAt: r.end_at,
          });
          dateSet.add(r.date);
          staffSet.add(r.staff_id);
        }
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

      return buildProjectDailyStaffTimeOverview({
        assignedDays,
        submissions,
        approvedRows,
        staffNames,
      });
    },
  });

  // ─── Sidoeffekt: engångs-backfill om submissions finns men cost lines saknas
  const backfilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabledQuery || !data) return;
    const fingerprint = queryKey.join('::');
    if (backfilledRef.current === fingerprint) return;

    const hasCountableSubmission = data.some((d) =>
      d.rows.some(
        (r) => r.submissionStatus && COUNTABLE_STATUS.has(r.submissionStatus),
      ),
    );
    const hasAnyCostLine = data.some((d) => d.totals.totalMinutes > 0);
    if (!hasCountableSubmission || hasAnyCostLine) return;

    backfilledRef.current = fingerprint;
    (async () => {
      try {
        const body: any = {};
        if (largeProjectId) body.large_project_id = largeProjectId;
        else if (bookingIds.length > 0) body.booking_ids = bookingIds;
        await supabase.functions.invoke('backfill-project-staff-time-cost-lines', {
          body,
        });
        refetch();
      } catch (e) {
        console.warn('[useProjectDailyStaffTimeOverview] backfill failed', e);
      }
    })();
  }, [data, enabledQuery, largeProjectId, bookingIds, refetch, queryKey]);

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
