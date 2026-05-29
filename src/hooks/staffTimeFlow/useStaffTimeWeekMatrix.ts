/**
 * useStaffTimeWeekMatrix — admin-översikt: alla personer × veckans 7 dagar.
 *
 * Bygger view-modellen för den nya Tid & Lön-veckomatrisen. Återanvänder
 * mapDbStatusToFlow så att admin och app delar EXAKT samma statusvokabulär
 * (gps_proposal | submitted_waiting_approval | correction_requested | approved).
 *
 * Datakällor (admin-only, en query per typ — N+1 undviks):
 *   - staff_members (is_active=true) för rad-lista
 *   - staff_day_submissions för hela veckan + hela organisationen
 *
 * GPS-förslagets minuter beräknas INTE här (det skulle kräva per-staff
 * batch-jobb). Cellen visar bara "GPS"/"Inget" och "Granska"-knappen länkar
 * till befintliga /staff-management/gps-satellite-map. Det är medvetet och
 * matchar Time Engine-policyn: matrisen är bara en lins, inte en motor.
 *
 * Rör INTE: time_reports, workdays, location_time_entries, travel_time_logs,
 * day_attestations, staff_day_report_cache.
 */

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { mapDbStatusToFlow } from "@/lib/staffTimeFlow/weekFlow";
import type { WeekFlowStatus } from "@/lib/staffTimeFlow/types";
import { formatStockholmHm } from "@/lib/staff/formatStockholmTime";

export interface StaffTimeMatrixCell {
  date: string;
  status: WeekFlowStatus | "empty";
  startTime: string | null;     // HH:mm i Stockholm
  endTime: string | null;
  totalMinutes: number;
  travelMinutes: number;
  submissionId: string | null;
  reviewComment: string | null;
}

export interface StaffTimeMatrixRow {
  staffId: string;
  staffName: string;
  days: StaffTimeMatrixCell[]; // exakt 7
  /** Submissions som väntar adminattest (för Godkänn-knappen). */
  pendingSubmissionIds: string[];
}

export interface StaffTimeMatrix {
  weekStart: string;
  weekEnd: string;
  rows: StaffTimeMatrixRow[];
}

interface SubmissionRow {
  id: string;
  staff_id: string;
  date: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number | null;
  review_comment: string | null;
  source_summary_json: Record<string, unknown> | null;
}

interface StaffMember {
  id: string;
  name: string;
}

function totalMinutesOf(sub: SubmissionRow): number {
  const sum = sub.source_summary_json as Record<string, any> | null;
  if (sum && typeof sum.totalDurationMinutes === "number") return Math.max(0, Math.round(sum.totalDurationMinutes));
  if (sum && typeof sum.totalWorkMinutes === "number") return Math.max(0, Math.round(sum.totalWorkMinutes));
  if (sub.requested_start_at && sub.requested_end_at) {
    const s = Date.parse(sub.requested_start_at);
    const e = Date.parse(sub.requested_end_at);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      return Math.max(0, Math.round((e - s) / 60_000) - (sub.break_minutes ?? 0));
    }
  }
  return 0;
}

function travelMinutesOf(sub: SubmissionRow): number {
  const sum = sub.source_summary_json as Record<string, any> | null;
  if (sum && typeof sum.travelMinutes === "number") return Math.max(0, Math.round(sum.travelMinutes));
  if (sum && typeof sum.travelMinutesBuckets === "number") return Math.max(0, Math.round(sum.travelMinutesBuckets));
  return 0;
}

function hmFromSubmission(sub: SubmissionRow, which: "start" | "end"): string | null {
  // Föredra requested_*_at (ISO med tz) → konvertera till Sthlm.
  const iso = which === "start" ? sub.requested_start_at : sub.requested_end_at;
  if (iso) {
    const hm = formatStockholmHm(iso);
    if (hm) return hm;
  }
  const stored = which === "start" ? sub.start_time : sub.end_time;
  if (stored && typeof stored === "string") {
    // "HH:mm[:ss]" → "HH:mm"
    const m = stored.match(/^(\d{2}:\d{2})/);
    if (m) return m[1];
  }
  return null;
}

export interface UseStaffTimeWeekMatrixParams {
  weekDates: Date[];
}

export interface UseStaffTimeWeekMatrixResult {
  matrix: StaffTimeMatrix | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useStaffTimeWeekMatrix(params: UseStaffTimeWeekMatrixParams): UseStaffTimeWeekMatrixResult {
  const { weekDates } = params;
  const { organizationId } = useCurrentOrg();
  const qc = useQueryClient();

  const dateStrs = useMemo(() => weekDates.map((d) => format(d, "yyyy-MM-dd")), [weekDates]);
  const from = dateStrs[0] ?? null;
  const to = dateStrs[dateStrs.length - 1] ?? null;

  const staffQuery = useQuery({
    queryKey: ["staff-time-matrix-staff", organizationId],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((s) => ({ id: String(s.id), name: String(s.name ?? "—") }));
    },
  });

  const subsQuery = useQuery({
    queryKey: ["staff-time-matrix-subs", organizationId, from, to],
    enabled: !!organizationId && !!from && !!to,
    staleTime: 15_000,
    queryFn: async (): Promise<SubmissionRow[]> => {
      const { data, error } = await supabase
        .from("staff_day_submissions")
        .select(
          "id, staff_id, date, status, start_time, end_time, requested_start_at, requested_end_at, break_minutes, review_comment, source_summary_json",
        )
        .eq("organization_id", organizationId)
        .gte("date", from!)
        .lte("date", to!)
        .order("submitted_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });

  // Realtime: invalidera när någon submission ändras i org.
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`staff-time-matrix-${organizationId}-${from}-${to}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "staff_day_submissions", filter: `organization_id=eq.${organizationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["staff-time-matrix-subs"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizationId, from, to, qc]);

  const matrix = useMemo<StaffTimeMatrix | null>(() => {
    if (!from || !to) return null;
    const staff = staffQuery.data ?? [];
    const subs = subsQuery.data ?? [];

    // Senaste submission per (staff,date). Listan är redan submitted_at desc.
    const byStaffDate = new Map<string, SubmissionRow>();
    for (const s of subs) {
      const key = `${s.staff_id}|${s.date}`;
      if (!byStaffDate.has(key)) byStaffDate.set(key, s);
    }

    const rows: StaffTimeMatrixRow[] = staff.map((s) => {
      const pendingIds: string[] = [];
      const days: StaffTimeMatrixCell[] = dateStrs.map((d) => {
        const sub = byStaffDate.get(`${s.id}|${d}`);
        if (!sub) {
          return {
            date: d,
            status: "empty" as const,
            startTime: null,
            endTime: null,
            totalMinutes: 0,
            travelMinutes: 0,
            submissionId: null,
            reviewComment: null,
          };
        }
        const flowStatus = mapDbStatusToFlow(String(sub.status));
        if (flowStatus === "submitted_waiting_approval") pendingIds.push(sub.id);
        return {
          date: d,
          status: flowStatus,
          startTime: hmFromSubmission(sub, "start"),
          endTime: hmFromSubmission(sub, "end"),
          totalMinutes: totalMinutesOf(sub),
          travelMinutes: travelMinutesOf(sub),
          submissionId: sub.id,
          reviewComment: sub.review_comment ?? null,
        };
      });
      return { staffId: s.id, staffName: s.name, days, pendingSubmissionIds: pendingIds };
    });

    return { weekStart: from, weekEnd: to, rows };
  }, [staffQuery.data, subsQuery.data, dateStrs, from, to]);

  return {
    matrix,
    isLoading: staffQuery.isLoading || subsQuery.isLoading,
    isError: staffQuery.isError || subsQuery.isError,
    refetch: () => { staffQuery.refetch(); subsQuery.refetch(); },
  };
}
