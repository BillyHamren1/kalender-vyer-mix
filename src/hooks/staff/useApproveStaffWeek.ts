import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  StaffDaySubmissionStatus,
  StaffWeeklySubmissionRow,
} from "./useStaffWeeklyTimeApprovals";

// Statusar vi får godkänna i bulk
const APPROVABLE: ReadonlySet<StaffDaySubmissionStatus> = new Set([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_control",
  "needs_user_attention",
]);

// Statusar som ska lämnas i fred (blockerar full vecka-godkänning)
const BLOCKED: ReadonlySet<StaffDaySubmissionStatus> = new Set([
  "correction_requested",
  "payroll_approved",
  "missing_report",
]);

export interface ApproveWeekInput {
  submissions: StaffWeeklySubmissionRow[];
}

export interface ApproveWeekResult {
  approvedCount: number;
  skippedCount: number;
  failed: Array<{ id: string; date: string; error: string }>;
  blockedDates: string[];
}

export function isApprovableSubmission(s: StaffWeeklySubmissionRow): boolean {
  return APPROVABLE.has(s.status as StaffDaySubmissionStatus);
}

export function isBlockedSubmission(s: StaffWeeklySubmissionRow): boolean {
  return BLOCKED.has(s.status as StaffDaySubmissionStatus);
}

export function useApproveStaffWeek() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ submissions }: ApproveWeekInput): Promise<ApproveWeekResult> => {
      const approvable = submissions.filter(isApprovableSubmission);
      const blockedDates = submissions
        .filter(isBlockedSubmission)
        .map((s) => s.date);

      const failed: Array<{ id: string; date: string; error: string }> = [];
      let approvedCount = 0;

      for (const sub of approvable) {
        const { data, error } = await supabase.functions.invoke(
          "update-staff-day-submission-status",
          { body: { submission_id: sub.id, status: "approved" } },
        );
        if (error || (data as any)?.error) {
          failed.push({
            id: sub.id,
            date: sub.date,
            error:
              (data as any)?.message ??
              (data as any)?.error ??
              error?.message ??
              "Okänt fel",
          });
        } else {
          approvedCount++;
        }
      }

      return {
        approvedCount,
        skippedCount: submissions.length - approvable.length,
        failed,
        blockedDates,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-weekly-time-approvals"] });
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
    },
  });
}
