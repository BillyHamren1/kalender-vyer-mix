/**
 * useStaffSelfWeekMatrix — mobilappens veckovy.
 *
 * Anropar EN endpoint: `get-staff-time-week-matrix` med mobile token.
 * Edge function returnerar matris med EN rad (self) — exakt samma shape
 * och samma resolver (`resolveStaffDayReportsBatch`) som admin Tid & Lön.
 *
 * Single-pipeline garanti:
 *   submission > staff_day_report_cache > empty
 *
 * Får ALDRIG:
 *   - bygga om dagen från raw GPS (staff_location_history)
 *   - anropa `useStaffGpsWeekSummary` / `get-staff-gps-week-summary`
 *   - anropa `buildCanonicalStaffDayGpsResult`
 *   - anropa `get-mobile-gps-day-view` / `submit-mobile-gps-day-v2`
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { callStaffSnapshotFunction } from "@/services/staffSnapshotApi";
import { useStaffDayRealtimeInvalidation } from "@/hooks/staff/useStaffDayRealtimeInvalidation";
import type {
  StaffTimeMatrix,
  StaffTimeMatrixRow,
  StaffTimeMatrixCell,
} from "./useStaffTimeWeekMatrix";

export interface UseStaffSelfWeekMatrixParams {
  staffId: string | null;
  weekDates: Date[];
}

export interface UseStaffSelfWeekMatrixResult {
  row: StaffTimeMatrixRow | null;
  cellsByDate: Map<string, StaffTimeMatrixCell>;
  weekStart: string | null;
  weekEnd: string | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useStaffSelfWeekMatrix(
  params: UseStaffSelfWeekMatrixParams,
): UseStaffSelfWeekMatrixResult {
  const { staffId, weekDates } = params;
  const from = weekDates.length > 0 ? format(weekDates[0], "yyyy-MM-dd") : null;
  const to = weekDates.length > 0 ? format(weekDates[weekDates.length - 1], "yyyy-MM-dd") : null;

  const query = useQuery({
    queryKey: ["staff-self-week-matrix", staffId, from, to],
    enabled: !!staffId && !!from && !!to,
    staleTime: 15_000,
    queryFn: async (): Promise<StaffTimeMatrix> => {
      const data = await callStaffSnapshotFunction<Partial<StaffTimeMatrix>>(
        "get-staff-time-week-matrix",
        { weekStart: from },
      );
      return {
        weekStart: data.weekStart ?? from!,
        weekEnd: data.weekEnd ?? to!,
        rows: Array.isArray(data.rows) ? data.rows : [],
      };
    },
  });

  // Single-pipeline invalidation: cache + submissions.
  useStaffDayRealtimeInvalidation({
    channelKey: `staff-self-week-matrix-${staffId}-${from}-${to}`,
    staffId,
    queryKeys: [["staff-self-week-matrix"]],
    enabled: !!staffId,
  });

  const row = useMemo<StaffTimeMatrixRow | null>(() => {
    const rows = query.data?.rows ?? [];
    if (!staffId) return null;
    return rows.find((r) => r.staffId === staffId) ?? rows[0] ?? null;
  }, [query.data, staffId]);

  const cellsByDate = useMemo(() => {
    const m = new Map<string, StaffTimeMatrixCell>();
    for (const c of row?.days ?? []) m.set(c.date, c);
    return m;
  }, [row]);

  return {
    row,
    cellsByDate,
    weekStart: query.data?.weekStart ?? from,
    weekEnd: query.data?.weekEnd ?? to,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => { query.refetch(); },
  };
}
