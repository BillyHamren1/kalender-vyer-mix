import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovePayrollPeriodSummary {
  includedDays: number;
  excludedNeedsControl: number;
  alreadyApproved: number;
  staffCount: number;
  totalMinutes: number;
  periodStart: string;
  periodEnd: string;
}

export function useApprovePayrollPeriodDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payroll_period_id: string): Promise<ApprovePayrollPeriodSummary> => {
      const { data, error } = await supabase.functions.invoke(
        "approve-payroll-period-days",
        { body: { payroll_period_id } },
      );
      if (error) {
        const msg = (data as any)?.message ?? (data as any)?.error ?? error.message;
        throw new Error(msg ?? "Kunde inte godkänna perioden");
      }
      if ((data as any)?.error) {
        throw new Error((data as any).message ?? (data as any).error);
      }
      return (data as any).summary as ApprovePayrollPeriodSummary;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-period-report"] });
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
    },
  });
}
