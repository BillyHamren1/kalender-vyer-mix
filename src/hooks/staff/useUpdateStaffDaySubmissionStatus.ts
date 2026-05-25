import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminDayStatusUpdate = "approved" | "needs_control" | "correction_requested";

export interface UpdateDaySubmissionInput {
  submission_id: string;
  status: AdminDayStatusUpdate;
  review_comment?: string | null;
}

export function useUpdateStaffDaySubmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDaySubmissionInput) => {
      const { data, error } = await supabase.functions.invoke(
        "update-staff-day-submission-status",
        { body: input },
      );
      if (error) {
        // Edge function returned non-2xx → surface server message if present
        const serverMsg =
          (data as any)?.message ??
          (data as any)?.error ??
          error.message ??
          "Kunde inte uppdatera status";
        throw new Error(serverMsg);
      }
      if ((data as any)?.error) {
        throw new Error((data as any).message ?? (data as any).error);
      }
      return data as { ok: true; id: string; status: AdminDayStatusUpdate };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
    },
  });
}
