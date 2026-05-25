/**
 * usePayrollMonthReport — läser GODKÄNDA staff_day_submissions per månad.
 *
 * Källa: enbart `staff_day_submissions` med status in (approved, payroll_approved).
 * Rör ALDRIG time_reports, workdays, location_time_entries, staff_day_report_cache.
 *
 * Total arbetstid per dag:
 *   1) requested_start_at / requested_end_at om båda finns
 *   2) annars start_time/end_time mappade på `date` (Stockholm-lokal)
 *   minus break_minutes; om end < start tolkas det som nattpass.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { fetchStaffMembers } from "@/services/staffService";
import { endOfMonth, startOfMonth, format, parseISO } from "date-fns";

export type PayrollStatusFilter =
  | "all_approved"
  | "approved_only"
  | "payroll_approved_only";

export interface PayrollMonthRow {
  id: string;
  staff_id: string;
  date: string; // YYYY-MM-DD
  status: "approved" | "payroll_approved";
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number;
  comment: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  /** Beräknad arbetstid i minuter (netto, efter rast). */
  workMinutes: number;
  /** Beräknad start/slut i ISO för export. */
  computedStartIso: string | null;
  computedEndIso: string | null;
}

export interface PayrollMonthStaffSummary {
  staffId: string;
  staffName: string;
  email?: string | null;
  approvedDayCount: number;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  firstWorkedDate: string | null;
  lastWorkedDate: string | null;
  /** "klar" | "partial" | "missing" */
  state: "klar" | "partial" | "missing";
  rows: PayrollMonthRow[];
}

export interface PayrollMonthReportData {
  monthStart: string;
  monthEnd: string;
  totals: {
    totalWorkMinutes: number;
    totalBreakMinutes: number;
    approvedDayCount: number;
    staffCount: number;
    notReadyDayCount: number; // submissions i månaden som EJ är approved/payroll_approved
  };
  staffSummaries: PayrollMonthStaffSummary[];
}

const APPROVED_STATUSES = new Set(["approved", "payroll_approved"]);

/** Parsar en HH:MM[:SS]-sträng till total minuter (eller null). */
function parseHHMM(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Tolerant Stockholm-lokal ISO för (date, HH:mm) — enkel fallback för export. */
function localIso(date: string, hhmm: string | null): string | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return `${date}T${m[1]}:${m[2]}:00`;
}

/** Räkna nettoarbetstid (minuter) ur en submission-rad. */
function computeWorkMinutes(row: {
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number | null;
  date: string;
}): { workMinutes: number; startIso: string | null; endIso: string | null } {
  const breakMin = Math.max(0, Number(row.break_minutes ?? 0) || 0);

  // 1) ISO-tider om båda finns
  if (row.requested_start_at && row.requested_end_at) {
    const s = Date.parse(row.requested_start_at);
    const e = Date.parse(row.requested_end_at);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      const gross = Math.round((e - s) / 60000);
      return {
        workMinutes: Math.max(0, gross - breakMin),
        startIso: row.requested_start_at,
        endIso: row.requested_end_at,
      };
    }
  }

  // 2) Fallback: HH:MM på samma dag, stötta nattpass
  const sm = parseHHMM(row.start_time);
  const em = parseHHMM(row.end_time);
  if (sm !== null && em !== null) {
    let gross = em - sm;
    if (gross <= 0) gross += 24 * 60; // nattpass
    return {
      workMinutes: Math.max(0, gross - breakMin),
      startIso: localIso(row.date, row.start_time),
      endIso: localIso(row.date, row.end_time),
    };
  }

  return { workMinutes: 0, startIso: null, endIso: null };
}

export interface UsePayrollMonthReportParams {
  /** Valfri datum inom månaden — månaden härleds. */
  month: Date;
  staffId?: string | null;
  statusFilter?: PayrollStatusFilter;
}

export function usePayrollMonthReport(params: UsePayrollMonthReportParams) {
  const { organizationId } = useCurrentOrg();
  const { month, staffId, statusFilter = "all_approved" } = params;

  const monthStart = useMemo(() => format(startOfMonth(month), "yyyy-MM-dd"), [month]);
  const monthEnd = useMemo(() => format(endOfMonth(month), "yyyy-MM-dd"), [month]);

  const query = useQuery({
    queryKey: [
      "payroll-month-report",
      organizationId,
      monthStart,
      monthEnd,
      staffId ?? "all",
      statusFilter,
    ],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async (): Promise<PayrollMonthReportData> => {
      if (!organizationId) {
        return {
          monthStart,
          monthEnd,
          totals: {
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
            approvedDayCount: 0,
            staffCount: 0,
            notReadyDayCount: 0,
          },
          staffSummaries: [],
        };
      }

      // 1) Submissions i månaden (alla statusar för "ej redo"-räkning, men vi
      //    visar bara approved/payroll_approved-rader i rapporten).
      let q = supabase
        .from("staff_day_submissions")
        .select(
          [
            "id",
            "staff_id",
            "date",
            "status",
            "start_time",
            "end_time",
            "requested_start_at",
            "requested_end_at",
            "break_minutes",
            "comment",
            "review_comment",
            "reviewed_at",
          ].join(", "),
        )
        .eq("organization_id", organizationId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: true })
        .limit(5000);

      if (staffId) q = q.eq("staff_id", staffId);

      const { data, error } = await q;
      if (error) throw error;

      const rawRows = (data ?? []) as any[];

      // 2) Statusfilter
      const allowed = new Set<string>(
        statusFilter === "approved_only"
          ? ["approved"]
          : statusFilter === "payroll_approved_only"
            ? ["payroll_approved"]
            : ["approved", "payroll_approved"],
      );

      const approvedRows: PayrollMonthRow[] = [];
      let notReady = 0;
      for (const r of rawRows) {
        if (!APPROVED_STATUSES.has(r.status)) {
          notReady++;
          continue;
        }
        if (!allowed.has(r.status)) continue;
        const calc = computeWorkMinutes(r);
        approvedRows.push({
          id: String(r.id),
          staff_id: String(r.staff_id),
          date: String(r.date),
          status: r.status as "approved" | "payroll_approved",
          start_time: r.start_time ?? null,
          end_time: r.end_time ?? null,
          requested_start_at: r.requested_start_at ?? null,
          requested_end_at: r.requested_end_at ?? null,
          break_minutes: Math.max(0, Number(r.break_minutes ?? 0) || 0),
          comment: r.comment ?? null,
          review_comment: r.review_comment ?? null,
          reviewed_at: r.reviewed_at ?? null,
          workMinutes: calc.workMinutes,
          computedStartIso: calc.startIso,
          computedEndIso: calc.endIso,
        });
      }

      // 3) Bunta per personal
      const staff = await fetchStaffMembers({ includeInactive: true });
      const staffMap = new Map<string, { name: string; email?: string | null }>();
      for (const s of staff) {
        staffMap.set(String((s as any).id), {
          name: (s as any).name ?? "Okänd",
          email: (s as any).email ?? null,
        });
      }

      const byStaff = new Map<string, PayrollMonthRow[]>();
      for (const row of approvedRows) {
        const arr = byStaff.get(row.staff_id) ?? [];
        arr.push(row);
        byStaff.set(row.staff_id, arr);
      }

      const summaries: PayrollMonthStaffSummary[] = [];
      let totalWork = 0;
      let totalBreak = 0;
      let approvedDayCount = 0;

      for (const [sid, rows] of byStaff) {
        const sortedRows = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
        const work = sortedRows.reduce((sum, r) => sum + r.workMinutes, 0);
        const br = sortedRows.reduce((sum, r) => sum + r.break_minutes, 0);
        totalWork += work;
        totalBreak += br;
        approvedDayCount += sortedRows.length;

        // State
        const hasPayroll = sortedRows.some((r) => r.status === "payroll_approved");
        const hasApprovedOnly = sortedRows.some((r) => r.status === "approved");
        const state: PayrollMonthStaffSummary["state"] =
          sortedRows.length === 0
            ? "missing"
            : hasPayroll && !hasApprovedOnly
              ? "klar"
              : "partial";

        const info = staffMap.get(sid);
        summaries.push({
          staffId: sid,
          staffName: info?.name ?? "Okänd",
          email: info?.email ?? null,
          approvedDayCount: sortedRows.length,
          totalWorkMinutes: work,
          totalBreakMinutes: br,
          firstWorkedDate: sortedRows[0]?.date ?? null,
          lastWorkedDate: sortedRows[sortedRows.length - 1]?.date ?? null,
          state,
          rows: sortedRows,
        });
      }

      summaries.sort((a, b) => a.staffName.localeCompare(b.staffName, "sv"));

      return {
        monthStart,
        monthEnd,
        totals: {
          totalWorkMinutes: totalWork,
          totalBreakMinutes: totalBreak,
          approvedDayCount,
          staffCount: summaries.length,
          notReadyDayCount: notReady,
        },
        staffSummaries: summaries,
      };
    },
  });

  return { ...query, monthStart, monthEnd };
}

/** "8h 30m" / "0h" */
export function formatMinutes(min: number): string {
  if (!min || min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "8.50" decimal-timmar för export. */
export function formatHoursDecimal(min: number): string {
  return (min / 60).toFixed(2);
}

export function formatDateSv(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "yyyy-MM-dd");
  } catch {
    return iso;
  }
}
