// Shared pure helpers for get-staff-time-report-period.
// Backend owns the truth; UI must NOT re-aggregate raw tables.

import { buildMonthDays, type MonthDay } from "./staff-month-status.ts";

export type PeriodStatus = "draft" | "submitted" | "approved" | "mixed" | "empty";
export type PeriodKind = "week" | "month";

export interface PeriodTotals {
  workMinutes: number;
  workdayMinutes: number;
  allocatedMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
  overtimeMinutes: number;
  approvedMinutes: number;
  pendingReviewMinutes: number;
}

export interface PeriodBlocker {
  date: string;
  type: "missing_workday" | "open_workday" | "unresolved_flag" | "review_required" | "unallocated_time";
  message: string;
}

export interface PeriodDay extends MonthDay {
  shortReason: string | null;
}

export function eachDayInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let t = s.getTime(); t <= e.getTime(); t += 24 * 3600 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function shortReasonFor(d: MonthDay): string | null {
  if (d.status === "review_required") return "Behöver granskning";
  if (d.status === "open") return "Arbetsdag pågår";
  if (d.status === "missing") return "Saknar tid";
  if (d.status === "closed" && d.unallocatedMinutes > 0) return "Ej fördelad tid";
  if (d.flagsCount > 0) return `${d.flagsCount} fråga${d.flagsCount === 1 ? "" : "or"}`;
  return null;
}

export function buildPeriodPayload(args: {
  kind: PeriodKind;
  startDate: string;
  endDate: string;
  staffId: string;
  todayYmd: string;
  workdays: Parameters<typeof buildMonthDays>[1]["workdays"];
  timeReports: Array<{
    report_date: string;
    hours_worked: number | null;
    overtime_hours?: number | null;
  }>;
  travelLogs: Parameters<typeof buildMonthDays>[1]["travelLogs"];
  flags: Parameters<typeof buildMonthDays>[1]["flags"];
}) {
  const dates = eachDayInRange(args.startDate, args.endDate);
  const { days } = buildMonthDays(
    dates,
    {
      workdays: args.workdays,
      timeReports: args.timeReports,
      travelLogs: args.travelLogs,
      flags: args.flags,
    },
    args.todayYmd,
  );

  const overtimeMinutes = (args.timeReports ?? []).reduce(
    (sum, r) => sum + Math.round(((r.overtime_hours ?? 0) || 0) * 60),
    0,
  );

  const totals: PeriodTotals = {
    workMinutes: 0,
    workdayMinutes: 0,
    allocatedMinutes: 0,
    travelMinutes: 0,
    unallocatedMinutes: 0,
    overtimeMinutes,
    approvedMinutes: 0,
    pendingReviewMinutes: 0,
  };

  const periodDays: PeriodDay[] = days.map((d) => {
    totals.workdayMinutes += d.workdayMinutes;
    totals.workMinutes += d.workdayMinutes;
    totals.allocatedMinutes += d.allocatedMinutes;
    totals.travelMinutes += d.travelMinutes;
    totals.unallocatedMinutes += d.unallocatedMinutes;
    if (d.approved) totals.approvedMinutes += d.workdayMinutes;
    else if (d.status === "review_required" || d.status === "closed") {
      totals.pendingReviewMinutes += d.workdayMinutes;
    }
    return { ...d, shortReason: shortReasonFor(d) };
  });

  // Blockers prevent the user from confidently submitting the period.
  const blockers: PeriodBlocker[] = [];
  for (const d of periodDays) {
    if (d.isOngoing) {
      blockers.push({ date: d.date, type: "open_workday", message: "Arbetsdag pågår fortfarande" });
    }
    if (d.status === "review_required") {
      blockers.push({ date: d.date, type: "review_required", message: "Dagen behöver granskning" });
    }
    if (!d.approved && d.status === "closed" && d.unallocatedMinutes > 30) {
      blockers.push({
        date: d.date,
        type: "unallocated_time",
        message: "Ej fördelad arbetstid",
      });
    }
  }

  // Period status: derived from days.
  let status: PeriodStatus;
  const hasAny = periodDays.some((d) => d.workdayMinutes > 0);
  if (!hasAny) status = "empty";
  else if (periodDays.every((d) => d.workdayMinutes === 0 || d.approved)) status = "approved";
  else if (blockers.length > 0) status = "draft";
  else status = "submitted";

  return {
    period: { kind: args.kind, startDate: args.startDate, endDate: args.endDate },
    staffId: args.staffId,
    totals,
    days: periodDays,
    blockers,
    status,
    lastUpdatedAt: new Date().toISOString(),
  };
}
