import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { fetchStaffMembers } from "@/services/staffService";
import { matchesWeeklyApprovalsRealtime } from "./staffWeeklyTimeApprovalsRealtime";

export type StaffDaySubmissionStatus =
  | "submitted"
  | "edited"
  | "ai_flagged"
  | "needs_user_attention"
  | "needs_control"
  | "correction_requested"
  | "approved"
  | "payroll_approved"
  | "missing_report"
  | string;

export interface StaffWeeklySubmissionRow {
  id: string;
  organization_id: string;
  staff_id: string;
  date: string;
  status: StaffDaySubmissionStatus;
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number;
  comment: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  updated_at: string;
  display_timeline_snapshot_json: unknown | null;
  user_edits_json: unknown | null;
  source_summary_json: unknown | null;
  ai_validation_json: unknown | null;
}

/**
 * Time Engine / GPS-satellitens cache-rad per staff/date.
 * Källa för "Väntar personalattest" — finns innan personalen själv skickat in.
 *
 * VIKTIGT: I listvyn (useStaffWeeklyTimeApprovals) är endast `summary_json` (litet)
 * fyllt. De tunga fälten `report_candidate_blocks_json`, `display_blocks_json` och
 * `diagnostics_json` hämtas lazy i `useStaffDayApprovalDetails` när inspection-drawern
 * öppnas. De är därför markerade optional och kan saknas helt på en lista-cache-rad.
 */
export interface StaffWeeklyCacheRow {
  id: string;
  organization_id: string;
  staff_id: string;
  date: string;
  engine_version: string | null;
  summary_json: unknown | null;
  report_candidate_blocks_json?: unknown | null;
  display_blocks_json?: unknown | null;
  diagnostics_json?: unknown | null;
  built_at: string | null;
  stale: boolean | null;
  error: string | null;
}

export interface StaffWeeklyStaffMember {
  id: string;
  name: string;
  email?: string | null;
  avatar_url?: string | null;
}

export interface UseStaffWeeklyTimeApprovalsParams {
  weekStart: string; // YYYY-MM-DD (måndag)
  weekEnd: string;   // YYYY-MM-DD (söndag)
  staffId?: string | null;
  status?: string | null;
}

export interface StaffWeeklyTimeApprovalsResult {
  submissions: StaffWeeklySubmissionRow[];
  cacheRows: StaffWeeklyCacheRow[];
  staff: StaffWeeklyStaffMember[];
}

/**
 * Bara riktiga submission-statusar får filtreras via Supabase-queryn.
 * UI-statusar (pending_staff_attest, no_report, engine_error etc.) filtreras i modellen.
 */
const REAL_SUBMISSION_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_user_attention",
  "needs_control",
  "correction_requested",
  "approved",
  "payroll_approved",
  "missing_report",
  "rejected",
  "withdrawn",
]);

export function useStaffWeeklyTimeApprovals(params: UseStaffWeeklyTimeApprovalsParams) {
  const queryClient = useQueryClient();
  const { organizationId } = useCurrentOrg();
  const { weekStart, weekEnd, staffId, status } = params;

  const queryKey = [
    "staff-weekly-time-approvals",
    organizationId,
    weekStart,
    weekEnd,
    staffId ?? "all",
    status ?? "all",
  ] as const;

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`staff-weekly-time-approvals:${organizationId}:${weekStart}:${weekEnd}:${staffId ?? "all"}:${status ?? "all"}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "staff_day_submissions" },
        (payload: any) => {
          if (!matchesWeeklyApprovalsRealtime({ organizationId, weekStart, weekEnd, staffId, payload })) {
            return;
          }
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "staff_day_report_cache" },
        (payload: any) => {
          if (!matchesWeeklyApprovalsRealtime({ organizationId, weekStart, weekEnd, staffId, payload })) {
            return;
          }
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient, queryKey, staffId, status, weekEnd, weekStart]);

  return useQuery({
    queryKey,
    enabled: !!organizationId,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StaffWeeklyTimeApprovalsResult> => {
      if (!organizationId) return { submissions: [], cacheRows: [], staff: [] };

      // --- Submissions ---
      let subQ = supabase
        .from("staff_day_submissions")
        .select(
          [
            "id",
            "organization_id",
            "staff_id",
            "date",
            "status",
            "requested_start_at",
            "requested_end_at",
            "start_time",
            "end_time",
            "break_minutes",
            "comment",
            "review_comment",
            "reviewed_at",
            "reviewed_by",
            "submitted_at",
            "updated_at",
            "display_timeline_snapshot_json",
            "user_edits_json",
            "source_summary_json",
            "ai_validation_json",
          ].join(", "),
        )
        .eq("organization_id", organizationId)
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .order("date", { ascending: true })
        .order("submitted_at", { ascending: false })
        .limit(2000);

      if (staffId) subQ = subQ.eq("staff_id", staffId);
      // Endast riktiga submission-statusar skickas till Postgres; UI-statusar filtreras i modellen.
      if (status && REAL_SUBMISSION_STATUSES.has(status)) {
        subQ = subQ.eq("status", status);
      }

      // --- Engine cache (förslag innan personalen attesterat) ---
      // VIKTIGT: Denna hook är listvyn. Lägg ALDRIG diagnostics_json,
      // report_candidate_blocks_json eller display_blocks_json här. Dessa fält
      // är tunga (diagnostics_json är ~600 KB/rad) och orsakar statement timeout
      // när hela veckan laddas för många personer. De hämtas lazy i
      // useStaffDayApprovalDetails när inspection-drawern öppnas.
      // summary_json är lätt (KB-storlek) och räcker för start/slut/minuter i listan.
      let cacheQ = supabase
        .from("staff_day_report_cache")
        .select(
          [
            "id",
            "organization_id",
            "staff_id",
            "date",
            "engine_version",
            "summary_json",
            "built_at",
            "stale",
            "error",
          ].join(", "),
        )
        .eq("organization_id", organizationId)
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .order("date", { ascending: true })
        .order("built_at", { ascending: false })
        // Veckolista: 1000 räcker till ~140 personer x 7 dagar. För större
        // org bör vi i nästa steg byta till server-side summary endpoint.
        .limit(1000);


      if (staffId) cacheQ = cacheQ.eq("staff_id", staffId);

      const [{ data: submissionsData, error: subErr }, { data: cacheData, error: cacheErr }, allStaff] =
        await Promise.all([
          subQ,
          cacheQ,
          fetchStaffMembers({ includeInactive: true }).catch(() => []),
        ]);
      if (subErr) throw subErr;
      if (cacheErr) throw cacheErr;

      const staff: StaffWeeklyStaffMember[] = (allStaff ?? []).map((s: any) => ({
        id: String(s.id),
        name: s.name ?? s.full_name ?? s.email ?? "Okänd",
        email: s.email ?? null,
        avatar_url: s.avatar_url ?? null,
      }));

      return {
        submissions: (submissionsData ?? []) as unknown as StaffWeeklySubmissionRow[],
        cacheRows: (cacheData ?? []) as unknown as StaffWeeklyCacheRow[],
        staff,
      };
    },
  });
}
