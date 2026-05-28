// Lista alla submissions i org som väntar godkännande (submitted/edited/needs_control).
// Används av "Väntar godkännande"-toggle i Tid & Lön huvudvy.

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";

export interface PendingSubmissionRow {
  id: string;
  staff_id: string;
  date: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  submitted_at: string;
}

export interface PendingByStaff {
  staffId: string;
  staffName: string | null;
  staffColor: string | null;
  days: PendingSubmissionRow[];
}

const PENDING_STATUSES = ["submitted", "edited", "needs_control", "needs_user_attention", "ai_flagged"];

export function usePendingWeekSubmissions(weekDates: Date[]) {
  const { organizationId } = useCurrentOrg();
  const from = weekDates.length > 0 ? format(weekDates[0], "yyyy-MM-dd") : null;
  const to = weekDates.length > 0 ? format(weekDates[weekDates.length - 1], "yyyy-MM-dd") : null;

  return useQuery({
    queryKey: ["pending-week-submissions", organizationId, from, to],
    enabled: !!organizationId && !!from && !!to,
    staleTime: 15_000,
    queryFn: async (): Promise<PendingByStaff[]> => {
      if (!organizationId || !from || !to) return [];
      const { data: subs, error } = await supabase
        .from("staff_day_submissions")
        .select("id, staff_id, date, status, start_time, end_time, submitted_at")
        .eq("organization_id", organizationId)
        .in("status", PENDING_STATUSES)
        .gte("date", from)
        .lte("date", to)
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const rows = (subs ?? []) as PendingSubmissionRow[];
      const ids = Array.from(new Set(rows.map((r) => r.staff_id)));
      let staffMap = new Map<string, { name: string | null; color: string | null }>();
      if (ids.length > 0) {
        const { data: staff } = await supabase
          .from("staff_members")
          .select("id, name, color")
          .in("id", ids);
        for (const s of staff ?? []) {
          staffMap.set(String((s as any).id), {
            name: (s as any).name ?? null,
            color: (s as any).color ?? null,
          });
        }
      }

      const grouped = new Map<string, PendingByStaff>();
      for (const r of rows) {
        if (!grouped.has(r.staff_id)) {
          const meta = staffMap.get(r.staff_id);
          grouped.set(r.staff_id, {
            staffId: r.staff_id,
            staffName: meta?.name ?? null,
            staffColor: meta?.color ?? null,
            days: [],
          });
        }
        grouped.get(r.staff_id)!.days.push(r);
      }
      return Array.from(grouped.values()).sort((a, b) =>
        (a.staffName ?? "").localeCompare(b.staffName ?? "", "sv"),
      );
    },
  });
}
