import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MarkPayrollPeriodApprovedResult {
  ok: boolean;
  warning?: "needs_control_present";
  message?: string;
  needsControlCount?: number;
  includedCount?: number;
  summary?: {
    periodId: string;
    status: string;
    approvedAt: string;
    includedCount: number;
    needsControlCount: number;
  };
}

export function useMarkPayrollPeriodApproved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: { payroll_period_id: string; confirm?: boolean },
    ): Promise<MarkPayrollPeriodApprovedResult> => {
      const { data, error } = await supabase.functions.invoke(
        "mark-payroll-period-approved",
        { body: args },
      );
      if (error && !data) {
        throw new Error(error.message ?? "Kunde inte markera perioden");
      }
      const d = data as MarkPayrollPeriodApprovedResult & { error?: string };
      if (d?.error && !d.warning) {
        throw new Error(d.message ?? d.error);
      }
      return d;
    },
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["payroll-period-report"] });
        qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      }
    },
  });
}
