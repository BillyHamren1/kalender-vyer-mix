/**
 * useStaffDayApprovalDetails — lazy detail-query för en enskild dag/person
 * i Time-approvals-inspection-drawern.
 *
 * VIKTIGT:
 * - Denna hook körs ENDAST när drawer är öppen (enabled=open).
 * - Den hämtar de tunga fälten (`display_blocks_json`,
 *   `report_candidate_blocks_json`, `diagnostics_json`) som medvetet är
 *   uteslutna ur veckolist-queryn i useStaffWeeklyTimeApprovals.
 * - Veckolistan får ALDRIG börja läsa dessa fält. All detaljläsning sker här.
 * - Hooken är read-only och skriver inget till databasen.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffWeeklyCacheRow } from "./useStaffWeeklyTimeApprovals";

export interface UseStaffDayApprovalDetailsParams {
  cacheId?: string | null;
  staffId?: string | null;
  date?: string | null;
  organizationId?: string | null;
  enabled?: boolean;
}

export function useStaffDayApprovalDetails(params: UseStaffDayApprovalDetailsParams) {
  const { cacheId, staffId, date, organizationId, enabled = true } = params;
  const canQuery = !!cacheId || (!!staffId && !!date);

  return useQuery<StaffWeeklyCacheRow | null>({
    queryKey: [
      "staff-day-approval-details",
      cacheId ?? null,
      organizationId ?? null,
      staffId ?? null,
      date ?? null,
    ],
    enabled: enabled && canQuery,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let q = supabase
        .from("staff_day_report_cache")
        .select(
          [
            "id",
            "organization_id",
            "staff_id",
            "date",
            "engine_version",
            "summary_json",
            "report_candidate_blocks_json",
            "display_blocks_json",
            "diagnostics_json",
            "built_at",
            "stale",
            "error",
          ].join(", "),
        )
        .limit(1);

      if (cacheId) {
        q = q.eq("id", cacheId);
      } else {
        if (organizationId) q = q.eq("organization_id", organizationId);
        if (staffId) q = q.eq("staff_id", staffId);
        if (date) q = q.eq("date", date);
        q = q.order("built_at", { ascending: false });
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as StaffWeeklyCacheRow | null;
    },
  });
}
