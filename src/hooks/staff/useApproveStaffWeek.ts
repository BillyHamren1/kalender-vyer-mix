import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  StaffDaySubmissionStatus,
  StaffWeeklySubmissionRow,
} from "./useStaffWeeklyTimeApprovals";

// Statusar vi får godkänna i bulk (riktiga submissions som väntar adminattest)
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
  "approved",
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
  /** True om inget gick att godkänna (typiskt: bara pending_staff_attest finns). */
  noApprovable: boolean;
  noApprovableReason?: "pending_staff_attest" | "empty";
}

export function isApprovableSubmission(s: StaffWeeklySubmissionRow): boolean {
  return APPROVABLE.has(s.status as StaffDaySubmissionStatus);
}

export function isBlockedSubmission(s: StaffWeeklySubmissionRow): boolean {
  return BLOCKED.has(s.status as StaffDaySubmissionStatus);
}

export class NoApprovableError extends Error {
  reason: "pending_staff_attest" | "empty";
  constructor(reason: "pending_staff_attest" | "empty", message?: string) {
    super(
      message ??
        (reason === "pending_staff_attest"
          ? "Det finns inget att godkänna ännu. Dagarna väntar på personalattest."
          : "Det finns inget att godkänna."),
    );
    this.name = "NoApprovableError";
    this.reason = reason;
  }
}

export function useApproveStaffWeek() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ submissions }: ApproveWeekInput): Promise<ApproveWeekResult> => {
      const approvable = submissions.filter(isApprovableSubmission);
      const blockedDates = submissions.filter(isBlockedSubmission).map((s) => s.date);

      if (approvable.length === 0) {
        // Submission-listan är tom eller bara approved/blocked → ingen riktig submission att attestera.
        const reason: "pending_staff_attest" | "empty" =
          submissions.length === 0 ? "pending_staff_attest" : "empty";
        throw new NoApprovableError(reason);
      }

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
        noApprovable: false,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-weekly-time-approvals"] });
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
    },
  });
}
