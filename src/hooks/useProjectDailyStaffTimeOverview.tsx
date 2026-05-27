/**
 * useProjectDailyStaffTimeOverview
 * ============================================================================
 * React-Query-hook som hämtar:
 *   - booking_staff_assignments (för booking_ids) → assignedDays
 *   - staff_day_submissions      (per staff & datum-fönster) → submissions
 *   - project_staff_time_cost_lines (LP + bookings, dedup på row.id) → approvedRows
 *   - staff_members              → namn-map
 *
 * Returnerar resultatet från buildProjectDailyStaffTimeOverview.
 * Inga skrivningar.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildProjectDailyStaffTimeOverview,
  type AssignedDay,
  type ApprovedRowInput,
  type DailyOverviewRow,
  type SubmissionInput,
} from '@/lib/projects/projectDailyStaffTimeOverview';
import { fetchApprovedProjectStaffTimeCostSummary } from '@/services/projectStaffTimeCostLinesService';

interface Params {
  largeProjectId?: string | null;
  bookingIds: string[];
  /** ISO yyyy-MM-dd. Valfritt — om utelämnat används window från BSA + submissions + cost lines. */
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
      // 1. BSA-assignments för alla bokningar i projektet
      let assignedDays: AssignedDay[] = [];
      if (bookingIds.length > 0) {
        const { data: bsaRows, error: bsaErr } = await supabase
          .from('booking_staff_assignments')
          .select('booking_id, staff_id, assignment_date')
          .in('booking_id', bookingIds)
          .limit(5000);
        if (bsaErr) throw bsaErr;
        assignedDays = (bsaRows ?? [])
          .filter((r: any) => r.assignment_date && r.staff_id)
          .map((r: any) => ({
            date: String(r.assignment_date).slice(0, 10),
            staff_id: r.staff_id,
            source: 'bsa' as const,
          }));
      }

      // 2. Datum-fönster + staff-set för submission-query
      const dateSet = new Set<string>(assignedDays.map((a) => a.date));
      const staffSet = new Set<string>(assignedDays.map((a) => a.staff_id));

      // 3. Godkända cost lines (LP + bookings, dedup hanteras av servicen)
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
          });
          dateSet.add(r.date);
          staffSet.add(r.staff_id);
        }
      }

      // 4. Submissions för relevant fönster
      // Använd startDate/endDate om angivet, annars min/max av dateSet ± 1 dag.
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

      // 5. Staff names
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
