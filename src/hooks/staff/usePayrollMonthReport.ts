/**
 * usePayrollMonthReport — läser GODKÄND tid (staff_day_submissions) per månad.
 *
 * Källa: ENDAST `staff_day_submissions` med status in (approved, payroll_approved).
 * Rör ALDRIG time_reports, workdays, location_time_entries, staff_day_report_cache,
 * Time Engine. Read-only. Inga mutationer.
 *
 * Total arbetstid per dag (calculateSubmissionMinutes):
 *   1) Om requested_start_at + requested_end_at finns → använd dem.
 *   2) Annars start_time/end_time mappade på `date` (Stockholm-lokal).
 *   3) Om end_time < start_time → nattpass över midnatt (+24h).
 *   - Dra av break_minutes. Aldrig negativ tid. 0 om tider saknas.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { fetchStaffMembers } from "@/services/staffService";
import { endOfMonth, startOfMonth, format, parseISO } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Status-filter
// ─────────────────────────────────────────────────────────────────────────────
/** Ny spec: "all_approved" | "approved" | "payroll_approved".
 *  Legacy alias: "approved_only" / "payroll_approved_only". */
export type PayrollStatusFilter =
  | "all_approved"
  | "approved"
  | "payroll_approved"
  | "approved_only"
  | "payroll_approved_only";

const APPROVED_STATUSES = new Set(["approved", "payroll_approved"]);

function normalizeStatusFilter(s: PayrollStatusFilter): Set<string> {
  if (s === "approved" || s === "approved_only") return new Set(["approved"]);
  if (s === "payroll_approved" || s === "payroll_approved_only")
    return new Set(["payroll_approved"]);
  return new Set(["approved", "payroll_approved"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tidsberäkning
// ─────────────────────────────────────────────────────────────────────────────
function parseHHMM(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function localIso(date: string, hhmm: string | null): string | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return `${date}T${m[1]}:${m[2]}:00`;
}

export interface SubmissionLike {
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number | null;
  date: string;
}

/** Helper enligt spec: returnerar nettoarbetstid i minuter (+ ISO start/end). */
export function calculateSubmissionMinutes(row: SubmissionLike): {
  totalMinutes: number;
  startIso: string | null;
  endIso: string | null;
} {
  const breakMin = Math.max(0, Number(row.break_minutes ?? 0) || 0);

  // 1) ISO-tider om båda finns
  if (row.requested_start_at && row.requested_end_at) {
    const s = Date.parse(row.requested_start_at);
    const e = Date.parse(row.requested_end_at);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      const gross = Math.round((e - s) / 60000);
      return {
        totalMinutes: Math.max(0, gross - breakMin),
        startIso: row.requested_start_at,
        endIso: row.requested_end_at,
      };
    }
  }

  // 2) Fallback: HH:MM på samma dag, stötta nattpass över midnatt
  const sm = parseHHMM(row.start_time);
  const em = parseHHMM(row.end_time);
  if (sm !== null && em !== null) {
    let gross = em - sm;
    if (gross <= 0) gross += 24 * 60; // nattpass
    return {
      totalMinutes: Math.max(0, gross - breakMin),
      startIso: localIso(row.date, row.start_time),
      endIso: localIso(row.date, row.end_time),
    };
  }

  return { totalMinutes: 0, startIso: null, endIso: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Typer (ny spec)
// ─────────────────────────────────────────────────────────────────────────────
export interface PayrollMonthRow {
  id: string;
  staff_id: string;
  date: string;
  weekday: string;
  status: "approved" | "payroll_approved";
  start_time: string | null;
  end_time: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  break_minutes: number;
  total_minutes: number;
  comment: string | null;
  review_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;

  // ── Legacy alias-fält (bakåtkompatibilitet med befintliga komponenter) ──
  /** @deprecated Use total_minutes */
  workMinutes: number;
  /** @deprecated */
  computedStartIso: string | null;
  /** @deprecated */
  computedEndIso: string | null;
}

export interface PayrollMonthGroup {
  staff_id: string;
  staff_name: string;
  staff_email: string | null;
  days_count: number;
  first_date: string | null;
  last_date: string | null;
  total_minutes: number;
  total_break_minutes: number;
  approved_days_count: number;
  payroll_approved_days_count: number;
  rows: PayrollMonthRow[];

  // ── Legacy alias-fält ──
  /** @deprecated Use staff_id */
  staffId: string;
  /** @deprecated Use staff_name */
  staffName: string;
  /** @deprecated Use staff_email */
  email: string | null;
  /** @deprecated Use days_count */
  approvedDayCount: number;
  /** @deprecated Use total_minutes */
  totalWorkMinutes: number;
  /** @deprecated Use total_break_minutes */
  totalBreakMinutes: number;
  /** @deprecated Use first_date */
  firstWorkedDate: string | null;
  /** @deprecated Use last_date */
  lastWorkedDate: string | null;
  /** @deprecated */
  state: "klar" | "partial" | "missing";
}

/** Bakåtkompatibel alias för befintliga komponenter. */
export type PayrollMonthStaffSummary = PayrollMonthGroup;

export interface PayrollMonthReportData {
  month: string; // YYYY-MM
  monthStart: string; // YYYY-MM-DD
  monthEnd: string; // YYYY-MM-DD
  totals: {
    staffCount: number;
    approvedDaysCount: number;
    totalMinutes: number;
    totalBreakMinutes: number;
    payrollApprovedDaysCount: number;
    approvedOnlyDaysCount: number;

    // ── Legacy alias ──
    /** @deprecated Use approvedDaysCount */
    approvedDayCount: number;
    /** @deprecated Use totalMinutes */
    totalWorkMinutes: number;
    /** @deprecated submissions i månaden som ej är approved/payroll_approved */
    notReadyDayCount: number;
  };
  groups: PayrollMonthGroup[];
  /** @deprecated Use groups */
  staffSummaries: PayrollMonthGroup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Params
// ─────────────────────────────────────────────────────────────────────────────
export interface UsePayrollMonthReportParams {
  /** "YYYY-MM" eller Date inom månaden. */
  month: string | Date;
  staffId?: string | null;
  status?: PayrollStatusFilter;
  /** @deprecated Använd `status` */
  statusFilter?: PayrollStatusFilter;
}

function toMonthString(m: string | Date): string {
  if (typeof m === "string") {
    if (/^\d{4}-\d{2}$/.test(m)) return m;
    if (/^\d{4}-\d{2}-\d{2}/.test(m)) return m.slice(0, 7);
    const d = new Date(m);
    return Number.isFinite(d.getTime()) ? format(d, "yyyy-MM") : format(new Date(), "yyyy-MM");
  }
  return format(m, "yyyy-MM");
}

function monthStringToDate(month: string): Date {
  return new Date(`${month}-01T00:00:00`);
}

const WEEKDAY_SV = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

function weekdaySv(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return WEEKDAY_SV[d.getDay()] ?? "";
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function usePayrollMonthReport(params: UsePayrollMonthReportParams) {
  const { organizationId } = useCurrentOrg();
  const monthStr = useMemo(() => toMonthString(params.month), [params.month]);
  const status: PayrollStatusFilter =
    params.status ?? params.statusFilter ?? "all_approved";
  const staffId = params.staffId ?? null;

  const monthStart = useMemo(
    () => format(startOfMonth(monthStringToDate(monthStr)), "yyyy-MM-dd"),
    [monthStr],
  );
  const monthEnd = useMemo(
    () => format(endOfMonth(monthStringToDate(monthStr)), "yyyy-MM-dd"),
    [monthStr],
  );

  const query = useQuery({
    queryKey: [
      "payroll-month-report",
      organizationId,
      monthStr,
      staffId ?? "all",
      status,
    ],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async (): Promise<PayrollMonthReportData> => {
      const emptyTotals = {
        staffCount: 0,
        approvedDaysCount: 0,
        totalMinutes: 0,
        totalBreakMinutes: 0,
        payrollApprovedDaysCount: 0,
        approvedOnlyDaysCount: 0,
        approvedDayCount: 0,
        totalWorkMinutes: 0,
        notReadyDayCount: 0,
      };

      if (!organizationId) {
        return {
          month: monthStr,
          monthStart,
          monthEnd,
          totals: emptyTotals,
          groups: [],
          staffSummaries: [],
        };
      }

      // 1) Hämta submissions för månaden (alla statusar — vi vill räkna "ej redo")
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
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
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
      const allowed = normalizeStatusFilter(status);

      const approvedRows: PayrollMonthRow[] = [];
      let notReady = 0;

      for (const r of rawRows) {
        if (!APPROVED_STATUSES.has(r.status)) {
          notReady++;
          continue;
        }
        if (!allowed.has(r.status)) continue;

        const calc = calculateSubmissionMinutes(r);
        const breakMin = Math.max(0, Number(r.break_minutes ?? 0) || 0);
        const dateStr = String(r.date);

        approvedRows.push({
          id: String(r.id),
          staff_id: String(r.staff_id),
          date: dateStr,
          weekday: weekdaySv(dateStr),
          status: r.status as "approved" | "payroll_approved",
          start_time: r.start_time ?? null,
          end_time: r.end_time ?? null,
          requested_start_at: r.requested_start_at ?? null,
          requested_end_at: r.requested_end_at ?? null,
          break_minutes: breakMin,
          total_minutes: calc.totalMinutes,
          comment: r.comment ?? null,
          review_comment: r.review_comment ?? null,
          submitted_at: r.submitted_at ?? null,
          reviewed_at: r.reviewed_at ?? null,
          reviewed_by: r.reviewed_by ?? null,

          // Legacy alias
          workMinutes: calc.totalMinutes,
          computedStartIso: calc.startIso,
          computedEndIso: calc.endIso,
        });
      }

      // 3) Personal-lookup
      const staffList = await fetchStaffMembers({ includeInactive: true });
      const staffMap = new Map<string, { name: string; email: string | null }>();
      for (const s of staffList) {
        staffMap.set(String((s as any).id), {
          name: (s as any).name ?? "Okänd",
          email: (s as any).email ?? null,
        });
      }

      // 4) Gruppera per personal
      const byStaff = new Map<string, PayrollMonthRow[]>();
      for (const row of approvedRows) {
        const arr = byStaff.get(row.staff_id) ?? [];
        arr.push(row);
        byStaff.set(row.staff_id, arr);
      }

      const groups: PayrollMonthGroup[] = [];
      let totalMinutes = 0;
      let totalBreak = 0;
      let approvedDays = 0;
      let payrollApprovedDays = 0;
      let approvedOnlyDays = 0;

      for (const [sid, rows] of byStaff) {
        const sortedRows = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
        const work = sortedRows.reduce((sum, r) => sum + r.total_minutes, 0);
        const br = sortedRows.reduce((sum, r) => sum + r.break_minutes, 0);
        const payrollCount = sortedRows.filter((r) => r.status === "payroll_approved").length;
        const approvedOnlyCount = sortedRows.filter((r) => r.status === "approved").length;

        totalMinutes += work;
        totalBreak += br;
        approvedDays += sortedRows.length;
        payrollApprovedDays += payrollCount;
        approvedOnlyDays += approvedOnlyCount;

        const info = staffMap.get(sid);
        const name = info?.name ?? "Okänd";
        const email = info?.email ?? null;

        const state: PayrollMonthGroup["state"] =
          sortedRows.length === 0
            ? "missing"
            : payrollCount > 0 && approvedOnlyCount === 0
              ? "klar"
              : "partial";

        groups.push({
          staff_id: sid,
          staff_name: name,
          staff_email: email,
          days_count: sortedRows.length,
          first_date: sortedRows[0]?.date ?? null,
          last_date: sortedRows[sortedRows.length - 1]?.date ?? null,
          total_minutes: work,
          total_break_minutes: br,
          approved_days_count: approvedOnlyCount,
          payroll_approved_days_count: payrollCount,
          rows: sortedRows,

          // Legacy alias
          staffId: sid,
          staffName: name,
          email,
          approvedDayCount: sortedRows.length,
          totalWorkMinutes: work,
          totalBreakMinutes: br,
          firstWorkedDate: sortedRows[0]?.date ?? null,
          lastWorkedDate: sortedRows[sortedRows.length - 1]?.date ?? null,
          state,
        });
      }

      groups.sort((a, b) => a.staff_name.localeCompare(b.staff_name, "sv"));

      const totals = {
        staffCount: groups.length,
        approvedDaysCount: approvedDays,
        totalMinutes,
        totalBreakMinutes: totalBreak,
        payrollApprovedDaysCount: payrollApprovedDays,
        approvedOnlyDaysCount: approvedOnlyDays,
        // Legacy alias
        approvedDayCount: approvedDays,
        totalWorkMinutes: totalMinutes,
        notReadyDayCount: notReady,
      };

      return {
        month: monthStr,
        monthStart,
        monthEnd,
        totals,
        groups,
        staffSummaries: groups,
      };
    },
  });

  return { ...query, month: monthStr, monthStart, monthEnd };
}

// ─────────────────────────────────────────────────────────────────────────────
// Format-helpers (oförändrade)
// ─────────────────────────────────────────────────────────────────────────────
export function formatMinutes(min: number): string {
  if (!min || min <= 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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
