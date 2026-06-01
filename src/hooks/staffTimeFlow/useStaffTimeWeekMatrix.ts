/**
 * useStaffTimeWeekMatrix — admin-översikt: alla personer × veckans 7 dagar.
 *
 * Anropar EN edge function: get-staff-time-week-matrix, som returnerar en
 * färdig matris med:
 *   - submission/snapshot om sådan finns (status från DB via mapDbStatusToFlow)
 *   - GPS-canonical-förslag (SAMMA builder som GPS-satellitkartan) om pings
 *     finns men ingen submission har skickats in
 *   - empty annars
 *
 * Cellen visar därmed start/slut, normal/övertid, restid och rader (samma
 * grunddata som /staff-management/gps-satellite-map).
 *
 * Statusvokabulär (mapDbStatusToFlow) är delad med /m/report:
 *   gps_proposal | submitted_waiting_approval | correction_requested | approved | empty
 *
 * Realtime: när staff_day_submissions ändras invalideras query.
 *
 * Rör INTE: time_reports, workdays, location_time_entries, travel_time_logs,
 * day_attestations, staff_day_report_cache.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useStaffDayRealtimeInvalidation } from "@/hooks/staff/useStaffDayRealtimeInvalidation";
import type { WeekFlowStatus } from "@/lib/staffTimeFlow/types";

export type StaffTimeMatrixCellStatus = WeekFlowStatus | "empty";

export interface StaffTimeMatrixRowItem {
  kind: "work" | "travel" | "private" | "unknown_place" | "gps_gap" | "other";
  label: string;
  startIso: string | null;
  endIso: string | null;
  minutes: number;
  fromLabel: string | null;
  toLabel: string | null;
}

export interface StaffTimeMatrixCell {
  date: string;
  status: StaffTimeMatrixCellStatus;
  source: "gps_proposal" | "submission_snapshot" | "empty";
  startTime: string | null;
  endTime: string | null;
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  submissionId: string | null;
  reviewComment: string | null;
  pingCount: number;
  gpsAvailable: boolean;
  rows: StaffTimeMatrixRowItem[];
}

export interface StaffTimeMatrixRow {
  staffId: string;
  staffName: string;
  days: StaffTimeMatrixCell[];
  pendingSubmissionIds: string[];
}

export interface StaffTimeMatrix {
  weekStart: string;
  weekEnd: string;
  rows: StaffTimeMatrixRow[];
}

export interface UseStaffTimeWeekMatrixParams {
  weekDates: Date[];
}

export interface UseStaffTimeWeekMatrixResult {
  matrix: StaffTimeMatrix | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useStaffTimeWeekMatrix(params: UseStaffTimeWeekMatrixParams): UseStaffTimeWeekMatrixResult {
  const { weekDates } = params;
  const { organizationId } = useCurrentOrg();

  const dateStrs = useMemo(() => weekDates.map((d) => format(d, "yyyy-MM-dd")), [weekDates]);
  const from = dateStrs[0] ?? null;
  const to = dateStrs[dateStrs.length - 1] ?? null;

  const matrixQuery = useQuery({
    queryKey: ["staff-time-week-matrix", organizationId, from, to],
    enabled: !!organizationId && !!from && !!to,
    staleTime: 15_000,
    queryFn: async (): Promise<StaffTimeMatrix> => {
      const { data, error } = await supabase.functions.invoke("get-staff-time-week-matrix", {
        body: { weekStart: from },
      });
      if (error) throw error;
      const d = (data ?? {}) as Partial<StaffTimeMatrix>;
      return {
        weekStart: d.weekStart ?? from!,
        weekEnd: d.weekEnd ?? to!,
        rows: Array.isArray(d.rows) ? d.rows : [],
      };
    },
  });

  // Realtime: en hook för båda single-pipeline-tabellerna (cache + submissions).
  useStaffDayRealtimeInvalidation({
    channelKey: `staff-time-matrix-${organizationId}-${from}-${to}`,
    organizationId,
    queryKeys: [
      ["staff-time-week-matrix"],
      ["staff-time-matrix-subs"], // backwards-compat (Row-knappen efter approve)
    ],
    enabled: !!organizationId,
  });

  return {
    matrix: matrixQuery.data ?? null,
    isLoading: matrixQuery.isLoading,
    isError: matrixQuery.isError,
    refetch: () => { matrixQuery.refetch(); },
  };
}
