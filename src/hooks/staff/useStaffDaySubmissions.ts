import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";

export type DaySubmissionStatus =
  | "submitted"
  | "edited"
  | "ai_flagged"
  | "needs_user_attention"
  | "needs_control"
  | "approved"
  | "payroll_approved";

export interface StaffDaySubmissionRow {
  id: string;
  organization_id: string;
  staff_id: string;
  date: string;
  status: DaySubmissionStatus | string;
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
}

export interface UseStaffDaySubmissionsParams {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  staffId?: string | null;
  status?: string | null;
}

export function useStaffDaySubmissions(params: UseStaffDaySubmissionsParams) {
  const { organizationId } = useCurrentOrg();
  const { from, to, staffId, status } = params;

  return useQuery({
    queryKey: ["staff-day-submissions", organizationId, from, to, staffId ?? "all", status ?? "all"],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async (): Promise<StaffDaySubmissionRow[]> => {
      if (!organizationId) return [];
      let q = supabase
        .from("staff_day_submissions")
        .select(
          "id, organization_id, staff_id, date, status, start_time, end_time, requested_start_at, requested_end_at, break_minutes, comment, review_comment, reviewed_at, reviewed_by, submitted_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .order("submitted_at", { ascending: false })
        .limit(1000);

      if (staffId) q = q.eq("staff_id", staffId);
      if (status) q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StaffDaySubmissionRow[];
    },
  });
}

export function useUpdateDaySubmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: DaySubmissionStatus;
      review_comment?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const reviewer = u?.user?.id ?? null;
      const { error } = await supabase
        .from("staff_day_submissions")
        .update({
          status: input.status,
          review_comment: input.review_comment ?? null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewer,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
    },
  });
}
