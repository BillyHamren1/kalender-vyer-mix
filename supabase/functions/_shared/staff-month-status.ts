// Shared pure helpers for get-staff-month-status.
// Backend owns the truth; the app must NOT re-aggregate raw tables.

export type MonthDayStatus =
  | "open"
  | "approved"
  | "review_required"
  | "closed"
  | "missing"
  | "off"
  | "locked";

export interface MonthDayInputs {
  workdays: Array<{
    started_at: string;
    ended_at: string | null;
    review_status: string | null;
    approved_at: string | null;
  }>;
  timeReports: Array<{
    report_date: string;
    hours_worked: number | null;
  }>;
  travelLogs: Array<{
    start_time: string;
    end_time: string | null;
    hours_worked: number | null;
    report_date?: string | null;
  }>;
  flags: Array<{
    flag_date: string;
    severity: string | null;
    resolved: boolean | null;
  }>;
}

export interface MonthDay {
  date: string;
  weekday: number; // 1=Mon..7=Sun (ISO)
  workdayMinutes: number;
  allocatedMinutes: number;
  allocatedProjectMinutes: number; // alias for backwards compat
  travelMinutes: number;
  unallocatedMinutes: number;
  isWorkdayOpen: boolean;
  hasFlags: boolean;
  flagsCount: number;
  reviewStatus: string | null;
  approved: boolean;
  locked: boolean;
  isToday: boolean;
  isOngoing: boolean;
  status: MonthDayStatus;
}

export interface MonthTotals {
  workdayMinutes: number;
  allocatedProjectMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
  approvedMinutes: number;
  pendingReviewMinutes: number;
  daysWithFlags: number;
}

function diffMin(start: string, end: string | null, now: Date): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : now.getTime();
  return Math.max(0, Math.round((e - s) / 60_000));
}

function hToMin(h: number | null | undefined): number {
  if (!h || !isFinite(h)) return 0;
  return Math.round(h * 60);
}

export function eachDayOfMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function isoWeekday(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

export function buildMonthDays(
  dates: string[],
  inputs: MonthDayInputs,
  todayYmd: string,
  now: Date = new Date(),
): { days: MonthDay[]; totals: MonthTotals } {
  type Bucket = {
    workdayMinutes: number;
    allocatedMinutes: number;
    travelMinutes: number;
    isWorkdayOpen: boolean;
    reviewStatus: string | null;
    approved: boolean;
    flagsCount: number;
    hasUnresolvedFlag: boolean;
    hasWorkday: boolean;
  };
  const buckets = new Map<string, Bucket>();
  const ensure = (date: string): Bucket => {
    let b = buckets.get(date);
    if (!b) {
      b = {
        workdayMinutes: 0,
        allocatedMinutes: 0,
        travelMinutes: 0,
        isWorkdayOpen: false,
        reviewStatus: null,
        approved: false,
        flagsCount: 0,
        hasUnresolvedFlag: false,
        hasWorkday: false,
      };
      buckets.set(date, b);
    }
    return b;
  };

  for (const w of inputs.workdays) {
    const date = w.started_at.slice(0, 10);
    const b = ensure(date);
    b.hasWorkday = true;
    b.workdayMinutes += diffMin(w.started_at, w.ended_at, now);
    if (!w.ended_at) b.isWorkdayOpen = true;
    if (w.review_status && !b.reviewStatus) b.reviewStatus = w.review_status;
    if (w.approved_at) b.approved = true;
  }
  for (const r of inputs.timeReports) {
    const b = ensure(r.report_date);
    b.allocatedMinutes += hToMin(r.hours_worked);
  }
  for (const t of inputs.travelLogs) {
    const date = t.report_date ?? t.start_time.slice(0, 10);
    const b = ensure(date);
    b.travelMinutes += hToMin(t.hours_worked) || diffMin(t.start_time, t.end_time, now);
  }
  for (const f of inputs.flags) {
    const b = ensure(f.flag_date);
    b.flagsCount += 1;
    if (!f.resolved) b.hasUnresolvedFlag = true;
  }

  const days: MonthDay[] = dates.map((date) => {
    const b = buckets.get(date);
    const wm = b?.workdayMinutes ?? 0;
    const allocated = b?.allocatedMinutes ?? 0;
    const travel = b?.travelMinutes ?? 0;
    const unallocated = Math.max(0, wm - allocated - travel);

    const weekday = isoWeekday(date);
    const isWeekend = weekday >= 6;
    const isFuture = date > todayYmd;
    const isOngoing = !!b?.isWorkdayOpen;
    const approved = !!b?.approved;
    const locked = approved; // approved days are locked from auto-edits

    let status: MonthDayStatus;
    if (locked) status = "locked";
    else if (isOngoing) status = "open";
    else if (approved) status = "approved";
    else if (b?.reviewStatus === "review_required" || b?.hasUnresolvedFlag) status = "review_required";
    else if (b?.hasWorkday) status = "closed";
    else if (isWeekend || isFuture) status = "off";
    else status = "missing";

    return {
      date,
      weekday,
      workdayMinutes: wm,
      allocatedMinutes: allocated,
      allocatedProjectMinutes: allocated,
      travelMinutes: travel,
      unallocatedMinutes: unallocated,
      isWorkdayOpen: isOngoing,
      hasFlags: (b?.flagsCount ?? 0) > 0,
      flagsCount: b?.flagsCount ?? 0,
      reviewStatus: b?.reviewStatus ?? null,
      approved,
      locked,
      isToday: date === todayYmd,
      isOngoing,
      status,
    };
  });

  const totals = days.reduce<MonthTotals>(
    (acc, d) => {
      acc.workdayMinutes += d.workdayMinutes;
      acc.allocatedProjectMinutes += d.allocatedMinutes;
      acc.travelMinutes += d.travelMinutes;
      acc.unallocatedMinutes += d.unallocatedMinutes;
      if (d.approved) acc.approvedMinutes += d.workdayMinutes;
      else if (d.status === "review_required" || d.status === "closed") {
        acc.pendingReviewMinutes += d.workdayMinutes;
      }
      if (d.hasFlags) acc.daysWithFlags += 1;
      return acc;
    },
    {
      workdayMinutes: 0,
      allocatedProjectMinutes: 0,
      travelMinutes: 0,
      unallocatedMinutes: 0,
      approvedMinutes: 0,
      pendingReviewMinutes: 0,
      daysWithFlags: 0,
    },
  );

  return { days, totals };
}
