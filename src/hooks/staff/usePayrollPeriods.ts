import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";

export interface PayrollPeriod {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  status: "draft" | "approved_for_payout" | string;
  created_at?: string;
}

export interface PayrollPeriodReportRow {
  id: string;
  date: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number;
  total_minutes: number;
  comment: string | null;
  review_comment: string | null;
}

export interface PayrollPeriodReportGroup {
  staff_id: string;
  staff_name: string;
  days_reported: number;
  total_minutes: number;
  total_break_minutes: number;
  rows: PayrollPeriodReportRow[];
}

export interface PayrollPeriodReport {
  period: PayrollPeriod;
  totals: { staff_count: number; submissions_count: number; total_minutes: number };
  groups: PayrollPeriodReportGroup[];
}

export function usePayrollPeriods() {
  const { organizationId } = useCurrentOrg();
  return useQuery({
    queryKey: ["payroll-periods", organizationId],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async (): Promise<PayrollPeriod[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("staff_payroll_periods")
        .select("id, name, period_start, period_end, status, created_at")
        .eq("organization_id", organizationId)
        .order("period_start", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PayrollPeriod[];
    },
  });
}

export function useCreatePayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; period_start: string; period_end: string }) => {
      const { data, error } = await supabase.functions.invoke("create-payroll-period", {
        body: input,
      });
      if (error) {
        const msg = (data as any)?.message ?? (data as any)?.error ?? error.message;
        throw new Error(msg ?? "Kunde inte skapa löneperiod");
      }
      if ((data as any)?.error) throw new Error((data as any).message ?? (data as any).error);
      return (data as any).period as PayrollPeriod;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
    },
  });
}

export function usePayrollPeriodReport(period_id: string | null) {
  return useQuery({
    queryKey: ["payroll-period-report", period_id],
    enabled: !!period_id,
    staleTime: 15_000,
    queryFn: async (): Promise<PayrollPeriodReport | null> => {
      if (!period_id) return null;
      const { data, error } = await supabase.functions.invoke("get-payroll-period-report", {
        body: { period_id },
      });
      if (error) {
        const msg = (data as any)?.message ?? (data as any)?.error ?? error.message;
        throw new Error(msg ?? "Kunde inte hämta period");
      }
      if ((data as any)?.error) throw new Error((data as any).message ?? (data as any).error);
      return data as PayrollPeriodReport;
    },
  });
}
