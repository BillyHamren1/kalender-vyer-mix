/**
 * @deprecated Do not use in project views.
 *
 * Project views must not read time_reports / location_time_entries /
 * travel_time_logs directly. Use `project_staff_time_cost_lines` via
 * `useProjectReportedTime` / `fetchProjectStaffTimeCostSummaryForTargets`
 * for reported project time.
 *
 * Kvar enbart för bakåtkompabilitet i admin/debug. Får INTE användas i
 * projekt-/large-project-vyer.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildProjectTimeSummary,
  type ProjectTarget,
  type ProjectTimeSummary,
  type PtmTimeReport,
  type PtmLocationTimeEntry,
  type PtmTravelLog,
} from '@/lib/projects/projectTimeModel';


interface UseProjectTimeSummaryArgs {
  target: ProjectTarget | null;
  includeBookingIds?: string[];
  dateRange?: { start: string; end: string };
}

const TR_COLS = 'id, staff_id, booking_id, large_project_id, start_time, end_time, hours_worked, break_time, approved, is_subdivision, source, source_entry_id';
const LTE_COLS = 'id, staff_id, booking_id, large_project_id, location_id, entered_at, exited_at, total_minutes, source, metadata';
const TRAVEL_COLS = 'id, staff_id, destination_booking_id, next_target_type, next_target_id, start_time, end_time, hours_worked, approved, auto_detected, source, classification';

/**
 * Hämtar TR + LTE + travel som matchar projektet och kör den gemensamma
 * buildProjectTimeSummary-pipen så projektvyer ser auto-startad/stoppad
 * timer + auto-switch travel utan att admin behöver pussla.
 */
export function useProjectTimeSummary({ target, includeBookingIds = [], dateRange }: UseProjectTimeSummaryArgs) {
  return useQuery<ProjectTimeSummary | null>({
    queryKey: ['project-time-summary', target, includeBookingIds.slice().sort(), dateRange?.start, dateRange?.end],
    enabled: !!target,
    staleTime: 30_000,
    queryFn: async () => {
      if (!target) return null;

      const bookingIds = new Set<string>(includeBookingIds);
      if (target.kind === 'booking') bookingIds.add(target.bookingId);
      const bookingArr = Array.from(bookingIds);

      // ── time_reports ─────────────────────────────────────────────
      const trQ = supabase.from('time_reports').select(TR_COLS).limit(1000);
      let timeReports: PtmTimeReport[] = [];
      if (target.kind === 'large_project') {
        const orFilter = bookingArr.length
          ? `large_project_id.eq.${target.largeProjectId},booking_id.in.(${bookingArr.join(',')})`
          : `large_project_id.eq.${target.largeProjectId}`;
        const { data, error } = await trQ.or(orFilter);
        if (error) throw error;
        timeReports = (data ?? []) as any;
      } else if (bookingArr.length) {
        const { data, error } = await trQ.in('booking_id', bookingArr);
        if (error) throw error;
        timeReports = (data ?? []) as any;
      }

      // ── location_time_entries ────────────────────────────────────
      const lteQ = supabase.from('location_time_entries').select(LTE_COLS).limit(1000);
      let lteRows: PtmLocationTimeEntry[] = [];
      if (target.kind === 'large_project') {
        const orFilter = bookingArr.length
          ? `large_project_id.eq.${target.largeProjectId},booking_id.in.(${bookingArr.join(',')})`
          : `large_project_id.eq.${target.largeProjectId}`;
        const { data, error } = await lteQ.or(orFilter);
        if (error) throw error;
        lteRows = (data ?? []) as any;
      } else if (bookingArr.length) {
        const { data, error } = await lteQ.in('booking_id', bookingArr);
        if (error) throw error;
        lteRows = (data ?? []) as any;
      }

      // ── travel_time_logs (destination_booking_id ELLER next_target_id) ─
      const travelQ = supabase.from('travel_time_logs').select(TRAVEL_COLS).limit(1000);
      let travelLogs: PtmTravelLog[] = [];
      const orParts: string[] = [];
      if (bookingArr.length) {
        orParts.push(`destination_booking_id.in.(${bookingArr.join(',')})`);
        orParts.push(`and(next_target_type.eq.booking,next_target_id.in.(${bookingArr.join(',')}))`);
      }
      if (target.kind === 'large_project') {
        orParts.push(`and(next_target_type.eq.large_project,next_target_id.eq.${target.largeProjectId})`);
      }
      if (orParts.length) {
        const { data, error } = await travelQ.or(orParts.join(','));
        if (error) throw error;
        travelLogs = (data ?? []) as any;
      }

      return buildProjectTimeSummary({
        target,
        includeBookingIds: bookingArr,
        dateRange,
        timeReports,
        locationTimeEntries: lteRows,
        travelLogs,
      });
    },
  });
}
