import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ApproveDayAction = "approved" | "needs_control" | "correction_requested";

export interface ApproveStaffDayInput {
  submission_id: string;
  action: ApproveDayAction;
  review_comment?: string | null;
}

export function useApproveStaffDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApproveStaffDayInput) => {
      const { data, error } = await supabase.functions.invoke(
        "update-staff-day-submission-status",
        {
          body: {
            submission_id: input.submission_id,
            status: input.action,
            review_comment: input.review_comment ?? null,
          },
        },
      );
      if (error || (data as any)?.error) {
        const msg =
          (data as any)?.message ??
          (data as any)?.error ??
          error?.message ??
          "Kunde inte uppdatera dagrapport";
        throw new Error(msg);
      }
      return data as { ok: true; id: string; status: ApproveDayAction };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-weekly-time-approvals"] });
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
    },
  });
}
