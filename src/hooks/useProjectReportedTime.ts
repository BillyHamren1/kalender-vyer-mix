/**
 * useProjectReportedTime
 * ----------------------
 * Levererar projektets rapporterade tid + kostnad i samma form som
 * ProjectTimeSummary, MEN ENBART från `project_staff_time_cost_lines`.
 *
 * Mappning:
 *   confirmedMinutes        ← approvedMinutes (attesterad)
 *   suggestedMinutes        ← unapprovedMinutes (inskickad, ej attesterad)
 *   activeMinutes           ← 0 (pågående timer hör inte hemma i projection)
 *   travelMinutesApproved   ← 0
 *   travelMinutesSuggested  ← 0
 *   staffBreakdown          ← byStaff (samma mappning per person)
 *   sourceRows              ← cost line rows som kind='time_report'
 *   anomalies               ← [] (anomalier byggs server-side numera)
 *
 * Projektvyer får INTE läsa time_reports / location_time_entries /
 * travel_time_logs / staff_day_report_cache direkt.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchProjectStaffTimeCostSummaryForTargets } from '@/services/projectStaffTimeCostLinesService';
import type {
  ProjectTarget,
  ProjectTimeSummary,
  PtmSourceRow,
  PtmStaffBreakdown,
} from '@/lib/projects/projectTimeModel';

interface Args {
  target: ProjectTarget | null;
  includeBookingIds?: string[];
}

export function useProjectReportedTime({ target, includeBookingIds = [] }: Args) {
  return useQuery<ProjectTimeSummary | null>({
    queryKey: [
      'project-reported-time',
      target,
      includeBookingIds.slice().sort(),
    ],
    enabled: !!target,
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectTimeSummary | null> => {
      if (!target) return null;
      const bookingIds = new Set<string>(includeBookingIds);
      if (target.kind === 'booking') bookingIds.add(target.bookingId);

      const summary = await fetchProjectStaffTimeCostSummaryForTargets({
        large_project_id: target.kind === 'large_project' ? target.largeProjectId : null,
        booking_ids: Array.from(bookingIds),
      });

      const staffBreakdown: PtmStaffBreakdown[] = summary.byStaff.map((s) => ({
        staffId: s.staff_id,
        confirmedMinutes: s.approvedMinutes,
        activeMinutes: 0,
        suggestedMinutes: s.unapprovedMinutes,
        travelMinutesApproved: 0,
        travelMinutesSuggested: 0,
      }));

      const sourceRows: PtmSourceRow[] = summary.rows.map((r) => ({
        rowId: r.id,
        staffId: r.staff_id,
        kind: 'time_report',
        minutes: r.minutes,
        decision: r.approvalState === 'approved'
          ? 'counted_confirmed'
          : 'counted_suggested',
        reason: r.source_label ?? r.submission_status,
        startIso: r.start_at ?? null,
        endIso: r.end_at ?? null,
      }));

      const result: ProjectTimeSummary = {
        target,
        confirmedMinutes: Math.round(summary.approvedHours * 60),
        activeMinutes: 0,
        suggestedMinutes: Math.round(summary.unapprovedHours * 60),
        travelMinutesApproved: 0,
        travelMinutesSuggested: 0,
        staffBreakdown,
        sourceRows,
        anomalies: [],
      };
      return result;
    },
  });
}
