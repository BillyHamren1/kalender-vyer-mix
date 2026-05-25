import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { fetchStaffMembers } from "@/services/staffService";

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
  staff: StaffWeeklyStaffMember[];
}

export function useStaffWeeklyTimeApprovals(params: UseStaffWeeklyTimeApprovalsParams) {
  const { organizationId } = useCurrentOrg();
  const { weekStart, weekEnd, staffId, status } = params;

  return useQuery({
    queryKey: [
      "staff-weekly-time-approvals",
      organizationId,
      weekStart,
      weekEnd,
      staffId ?? "all",
      status ?? "all",
    ],
    enabled: !!organizationId,
    staleTime: 15_000,
    queryFn: async (): Promise<StaffWeeklyTimeApprovalsResult> => {
      if (!organizationId) return { submissions: [], staff: [] };

      let q = supabase
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

      if (staffId) q = q.eq("staff_id", staffId);
      if (status) q = q.eq("status", status);

      const [{ data: submissionsData, error: subErr }, allStaff] = await Promise.all([
        q,
        fetchStaffMembers({ includeInactive: true }).catch(() => []),
      ]);
      if (subErr) throw subErr;

      const staff: StaffWeeklyStaffMember[] = (allStaff ?? []).map((s: any) => ({
        id: String(s.id),
        name: s.name ?? s.full_name ?? s.email ?? "Okänd",
        email: s.email ?? null,
        avatar_url: s.avatar_url ?? null,
      }));

      return {
        submissions: (submissionsData ?? []) as StaffWeeklySubmissionRow[],
        staff,
      };
    },
  });
}
