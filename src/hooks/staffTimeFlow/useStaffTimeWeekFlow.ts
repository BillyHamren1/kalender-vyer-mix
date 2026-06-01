// Gemensam hook för admin (Tid & Lön) och personalapp.
// Returnerar EN week-flow-modell (GPS-förslag + submissions) som båda vyer läser.
//
// Auth-strategi:
//   viewer === "admin" → Supabase JWT + useCurrentOrg + direkt .from() query
//                        + realtime på staff_day_submissions
//   viewer === "staff" → mobile token via callStaffSnapshotFunction
//                        (get-staff-time-flow-submissions). Ingen useCurrentOrg-
//                        beroende, ingen Supabase realtime. Refetch sker via
//                        query invalidation efter submit/approve.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useStaffGpsWeekSummary } from "@/hooks/staff/useStaffGpsWeekSummary";
import { buildWeekFlow } from "@/lib/staffTimeFlow/weekFlow";
import { callStaffSnapshotFunction } from "@/services/staffSnapshotApi";
import { useStaffDayRealtimeInvalidation } from "@/hooks/staff/useStaffDayRealtimeInvalidation";
import type { WeekFlow, WeekFlowViewer } from "@/lib/staffTimeFlow/types";
import type { StaffDaySubmissionRow } from "@/hooks/staff/useStaffDaySubmissions";

interface SubmissionWithSnapshot extends StaffDaySubmissionRow {
  display_timeline_snapshot_json: unknown | null;
}

export interface UseStaffTimeWeekFlowParams {
  staffId: string | null;
  weekDates: Date[];
  viewer: WeekFlowViewer;
}

export interface UseStaffTimeWeekFlowResult {
  flow: WeekFlow | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useStaffTimeWeekFlow(params: UseStaffTimeWeekFlowParams): UseStaffTimeWeekFlowResult {
  const { staffId, weekDates, viewer } = params;
  const { organizationId } = useCurrentOrg();

  const gps = useStaffGpsWeekSummary(staffId, weekDates);

  const from = weekDates.length > 0 ? format(weekDates[0], "yyyy-MM-dd") : null;
  const to = weekDates.length > 0 ? format(weekDates[weekDates.length - 1], "yyyy-MM-dd") : null;

  // Staff-vägen kräver INTE organizationId — mobile token resolvar org server-side.
  const enabled = viewer === "staff"
    ? !!staffId && !!from && !!to
    : !!organizationId && !!staffId && !!from && !!to;

  const subsQuery = useQuery({
    queryKey: ["staff-time-flow-submissions", viewer, organizationId, staffId, from, to],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<SubmissionWithSnapshot[]> => {
      if (!staffId || !from || !to) return [];

      if (viewer === "staff") {
        const res = await callStaffSnapshotFunction<{ submissions: SubmissionWithSnapshot[] }>(
          "get-staff-time-flow-submissions",
          { staffId, from, to },
        );
        return (res?.submissions ?? []) as SubmissionWithSnapshot[];
      }

      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("staff_day_submissions")
        .select(
          "id, organization_id, staff_id, date, status, start_time, end_time, requested_start_at, requested_end_at, break_minutes, comment, review_comment, reviewed_at, reviewed_by, submitted_at, updated_at, display_timeline_snapshot_json",
        )
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .gte("date", from)
        .lte("date", to)
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionWithSnapshot[];
    },
  });

  // Realtime invalidation — endast admin (JWT-session). Mobil auth har ingen
  // Supabase-session och kan inte prenumerera på postgres_changes.
  // Single-pipeline: cache + submissions via gemensam hook.
  useStaffDayRealtimeInvalidation({
    channelKey: `week-flow-${staffId}-${from}-${to}`,
    staffId,
    queryKeys: [["staff-time-flow-submissions"]],
    enabled: viewer === "admin" && !!organizationId && !!staffId,
  });

  const flow = useMemo<WeekFlow | null>(() => {
    if (!staffId || weekDates.length === 0) return null;
    const submissions = (subsQuery.data ?? []) as SubmissionWithSnapshot[];
    const snapshotsById: Record<string, unknown> = {};
    for (const s of submissions) {
      if (s.display_timeline_snapshot_json != null) {
        snapshotsById[s.id] = s.display_timeline_snapshot_json;
      }
    }
    return buildWeekFlow({
      staffId,
      weekDates,
      gpsSummaries: gps,
      submissions,
      snapshotsById,
      viewer,
    });
  }, [staffId, weekDates, gps, subsQuery.data, viewer]);

  return {
    flow,
    isLoading: subsQuery.isLoading || (gps[0]?.isLoading ?? false),
    refetch: () => subsQuery.refetch(),
  };
}
