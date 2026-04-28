/**
 * adminTimeReviewEngine — SHARED ANOMALY ENGINE FOR ADMIN TIME REVIEW
 * ====================================================================
 *
 * One source of truth for the numbers and anomalies that the three
 * admin surfaces share:
 *
 *   1. AdminTimeReviewDashboard  — list of person×day rows
 *   2. DayReviewPanel            — full detail view inside DailyOverviewDialog
 *   3. DayStatusBadge            — colored chip on rows / calendar cells
 *
 * PURE: no I/O, no React, no Supabase. Callers fetch what they have and
 * pass it in. This makes the engine trivially testable and lets the same
 * code run client-side or in a Deno edge function.
 *
 * INPUTS the engine accepts (all optional except workday/work):
 *   - workday          — the workdays row (started_at, ended_at)
 *   - workEntries      — completed time_reports for that staff/day
 *   - travelSegments   — travel_time_logs for that day (worked = true)
 *   - openTimer        — the running ActiveTimer if the day is still live
 *   - plannedStart     — earliest planned start across the day's bookings (ISO)
 *   - plannedEnd       — latest plannedEndOfDay across the day's bookings (ISO)
 *   - plannedMinutes   — sum of planned activity minutes (BSA span)
 *   - assistantEvents  — pending workday-assistant events for review
 *   - workdayFlags     — workday_flags rows for the day
 *   - now              — clock injection for tests; defaults to new Date()
 *
 * RULES (mirrored from the brief):
 *   - if open workday and now > planned end + tolerance →
 *       anomaly "stayed_after_planned_end"
 *   - if first project start > planned start + tolerance →
 *       anomaly "late_start"
 *   - if last project end > planned end + tolerance →
 *       anomaly "over_planned_time"
 *   - if workday total > reported + travel + accepted gap minutes →
 *       anomaly "unallocated_time"
 *   - if pending assistant events exist → anomaly "needs_review"
 *
 * The engine only PRODUCES findings. It never mutates anything.
 */

export const DEFAULT_LATENESS_TOLERANCE_MINUTES = 15;
export const DEFAULT_OVERTIME_TOLERANCE_MINUTES = 15;
export const DEFAULT_ACCEPTED_GAP_MINUTES = 30; // pauses < 30m don't count as unallocated

// ─────────────────────────────────────────────────────────────────────
// Input types — kept narrow & UI-agnostic
// ─────────────────────────────────────────────────────────────────────

export interface ReviewWorkdayInput {
  /** ISO timestamp the workday opened. */
  started_at: string;
  /** ISO timestamp the workday closed (null while still open). */
  ended_at: string | null;
}

export interface ReviewWorkEntry {
  id: string;
  /** ISO start. May be null for legacy entries — those are excluded. */
  start_time: string | null;
  /** ISO end. Null = still ongoing. */
  end_time: string | null;
  /** Authoritative paid hours (used as the source of total reported time). */
  hours_worked: number;
  /** Subdivisions are metadata only; engine ignores them in totals. */
  is_subdivision?: boolean;
  /** Approval status; used to colour rows but not to compute totals. */
  status?: string | null;
}

export interface ReviewTravelSegment {
  id: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
}

export interface ReviewOpenTimer {
  /** ISO start of the still-running activity. */
  startTime: string;
}

export interface ReviewAssistantEvent {
  id: string;
  /** Acknowledged events don't count as pending. */
  acknowledged: boolean;
}

export interface ReviewWorkdayFlag {
  id: string;
  flag_type: string;
  resolved_at: string | null;
}

export interface AdminTimeReviewInput {
  workday: ReviewWorkdayInput | null;
  workEntries: ReviewWorkEntry[];
  travelSegments?: ReviewTravelSegment[];
  openTimer?: ReviewOpenTimer | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  assistantEvents?: ReviewAssistantEvent[];
  workdayFlags?: ReviewWorkdayFlag[];
  now?: Date;
  toleranceMinutes?: {
    lateness?: number;
    overtime?: number;
    acceptedGap?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────

export type AnomalyKind =
  | 'stayed_after_planned_end'
  | 'late_start'
  | 'over_planned_time'
  | 'unallocated_time'
  | 'needs_review'
  | 'open_timer_stale'
  | 'overlap'
  | 'missing_logout';

export type AnomalySeverity = 'info' | 'warning' | 'critical';

export interface ReviewAnomaly {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** Short Swedish label for chips/badges. */
  label: string;
  /** One-line Swedish explanation for tooltips/detail rows. */
  detail: string;
  /** Number of minutes the anomaly represents (0 when not applicable). */
  minutes: number;
}

export interface ReviewMetrics {
  workdayMinutes: number;
  reportedActivityMinutes: number;
  travelMinutes: number;
  unallocatedMinutes: number;
  plannedMinutes: number;
  overtimeVsPlanned: number;
  lateStartMinutes: number;
  stayedAfterPlannedEndMinutes: number;
  openTimerAgeMinutes: number;
  overlapCount: number;
  pendingAssistantEventsCount: number;
}

export type ReviewStatus = 'ok' | 'warning' | 'critical';

export interface AdminTimeReviewResult {
  metrics: ReviewMetrics;
  anomalies: ReviewAnomaly[];
  /** Highest severity across all anomalies (drives badge colour). */
  status: ReviewStatus;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<AnomalySeverity, number> = { info: 0, warning: 1, critical: 2 };

function diffMinutes(later: Date, earlier: Date): number {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60_000));
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hoursToMinutes(hours: number | null | undefined): number {
  if (!hours || !Number.isFinite(hours)) return 0;
  return Math.max(0, Math.round(hours * 60));
}

function countOverlaps(
  entries: ReadonlyArray<{ start_time: string | null; end_time: string | null }>,
): number {
  const ranges = entries
    .map((e) => {
      const s = parseIso(e.start_time);
      const en = parseIso(e.end_time);
      return s && en && en.getTime() > s.getTime() ? { s: s.getTime(), e: en.getTime() } : null;
    })
    .filter((x): x is { s: number; e: number } => !!x)
    .sort((a, b) => a.s - b.s);

  let overlaps = 0;
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].s < ranges[i - 1].e) overlaps += 1;
  }
  return overlaps;
}

// ─────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────

export function evaluateAdminTimeReview(
  input: AdminTimeReviewInput,
): AdminTimeReviewResult {
  const now = input.now ?? new Date();
  const lateTol = input.toleranceMinutes?.lateness ?? DEFAULT_LATENESS_TOLERANCE_MINUTES;
  const overTol = input.toleranceMinutes?.overtime ?? DEFAULT_OVERTIME_TOLERANCE_MINUTES;
  const gapTol = input.toleranceMinutes?.acceptedGap ?? DEFAULT_ACCEPTED_GAP_MINUTES;

  // Subdivisions are metadata, not paid time — drop them from all sums.
  const realEntries = input.workEntries.filter((e) => !e.is_subdivision);
  const travel = input.travelSegments ?? [];

  // ---- Metric: workday duration -------------------------------------
  const workdayStart = parseIso(input.workday?.started_at ?? null);
  const workdayEnd = parseIso(input.workday?.ended_at ?? null);
  const workdayOpen = !!input.workday && !input.workday.ended_at;
  const workdayMinutes = workdayStart
    ? diffMinutes(workdayEnd ?? now, workdayStart)
    : 0;

  // ---- Metric: reported + travel ------------------------------------
  const reportedActivityMinutes = realEntries.reduce(
    (sum, e) => sum + hoursToMinutes(e.hours_worked),
    0,
  );
  const travelMinutes = travel.reduce(
    (sum, t) => sum + hoursToMinutes(t.hours_worked),
    0,
  );

  // ---- Metric: open timer age ---------------------------------------
  const openTimerStart = parseIso(input.openTimer?.startTime ?? null);
  const openTimerAgeMinutes = openTimerStart ? diffMinutes(now, openTimerStart) : 0;

  // ---- Metric: planned vs actual ------------------------------------
  const plannedStart = parseIso(input.plannedStart ?? null);
  const plannedEnd = parseIso(input.plannedEnd ?? null);
  const plannedMinutes = Math.max(0, input.plannedMinutes ?? 0);

  const firstActualStart = realEntries
    .map((e) => parseIso(e.start_time))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastActualEnd = realEntries
    .map((e) => parseIso(e.end_time))
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const lateStartMinutes =
    plannedStart && firstActualStart
      ? Math.max(0, diffMinutes(firstActualStart, plannedStart) - lateTol)
      : 0;

  const overtimeVsPlanned =
    plannedMinutes > 0
      ? Math.max(0, reportedActivityMinutes + travelMinutes - plannedMinutes)
      : 0;

  // "Kvar efter planerat" — workday is still open and we're past planned end.
  const stayedAfterPlannedEndMinutes =
    workdayOpen && plannedEnd && now.getTime() > plannedEnd.getTime() + overTol * 60_000
      ? diffMinutes(now, plannedEnd)
      : plannedEnd && lastActualEnd && lastActualEnd.getTime() > plannedEnd.getTime() + overTol * 60_000
        ? diffMinutes(lastActualEnd, plannedEnd)
        : 0;

  // ---- Metric: unallocated time -------------------------------------
  // Anything inside the workday window that isn't reported activity or
  // travel, beyond the accepted-gap tolerance, is "luckor".
  const accountedMinutes = reportedActivityMinutes + travelMinutes;
  const unallocatedMinutes =
    workdayMinutes > accountedMinutes + gapTol
      ? workdayMinutes - accountedMinutes
      : 0;

  // ---- Metric: overlaps & assistant events --------------------------
  const overlapCount = countOverlaps(realEntries);
  const pendingAssistantEventsCount = (input.assistantEvents ?? []).filter(
    (e) => !e.acknowledged,
  ).length;

  const metrics: ReviewMetrics = {
    workdayMinutes,
    reportedActivityMinutes,
    travelMinutes,
    unallocatedMinutes,
    plannedMinutes,
    overtimeVsPlanned,
    lateStartMinutes,
    stayedAfterPlannedEndMinutes,
    openTimerAgeMinutes,
    overlapCount,
    pendingAssistantEventsCount,
  };

  // ---- Anomalies ----------------------------------------------------
  const anomalies: ReviewAnomaly[] = [];

  if (stayedAfterPlannedEndMinutes > 0 && workdayOpen) {
    anomalies.push({
      kind: 'stayed_after_planned_end',
      severity: stayedAfterPlannedEndMinutes > 90 ? 'critical' : 'warning',
      label: 'Kvar efter planerat',
      detail: `Arbetsdagen är öppen ${stayedAfterPlannedEndMinutes} min efter planerat slut.`,
      minutes: stayedAfterPlannedEndMinutes,
    });
  } else if (stayedAfterPlannedEndMinutes > 0) {
    anomalies.push({
      kind: 'over_planned_time',
      severity: stayedAfterPlannedEndMinutes > 60 ? 'warning' : 'info',
      label: 'Över planerad tid',
      detail: `Sista aktiviteten slutade ${stayedAfterPlannedEndMinutes} min efter planerat.`,
      minutes: stayedAfterPlannedEndMinutes,
    });
  }

  if (lateStartMinutes > 0) {
    anomalies.push({
      kind: 'late_start',
      severity: lateStartMinutes > 30 ? 'warning' : 'info',
      label: 'Sen start',
      detail: `Första aktiviteten startade ${lateStartMinutes} min efter planerad starttid.`,
      minutes: lateStartMinutes,
    });
  }

  if (unallocatedMinutes > 0) {
    anomalies.push({
      kind: 'unallocated_time',
      severity: unallocatedMinutes > 60 ? 'warning' : 'info',
      label: 'Oallokerad tid',
      detail: `${unallocatedMinutes} min inom arbetsdagen saknar aktivitet eller restid.`,
      minutes: unallocatedMinutes,
    });
  }

  if (pendingAssistantEventsCount > 0) {
    anomalies.push({
      kind: 'needs_review',
      severity: 'warning',
      label: 'Behöver review',
      detail: `${pendingAssistantEventsCount} assistent-händelser väntar på bekräftelse.`,
      minutes: 0,
    });
  }

  if (workdayOpen && workdayEnd === null && !workdayStart) {
    anomalies.push({
      kind: 'missing_logout',
      severity: 'critical',
      label: 'Saknad utloggning',
      detail: 'Workday utan starttid — datasynk-fel.',
      minutes: 0,
    });
  } else if (!workdayOpen && workdayStart && !workdayEnd) {
    anomalies.push({
      kind: 'missing_logout',
      severity: 'critical',
      label: 'Saknad utloggning',
      detail: 'Workday öppnades men stängdes aldrig.',
      minutes: 0,
    });
  }

  if (openTimerAgeMinutes > 12 * 60) {
    anomalies.push({
      kind: 'open_timer_stale',
      severity: 'critical',
      label: 'Öppen timer',
      detail: `Aktiviteten har gått ${Math.floor(openTimerAgeMinutes / 60)}h ${openTimerAgeMinutes % 60}m utan stopp.`,
      minutes: openTimerAgeMinutes,
    });
  }

  if (overlapCount > 0) {
    anomalies.push({
      kind: 'overlap',
      severity: 'warning',
      label: 'Överlapp',
      detail: `${overlapCount} tidrapport(er) överlappar varandra.`,
      minutes: 0,
    });
  }

  // ---- Aggregate status --------------------------------------------
  const topRank = anomalies.reduce(
    (max, a) => Math.max(max, SEVERITY_RANK[a.severity]),
    0,
  );
  const status: ReviewStatus =
    topRank >= SEVERITY_RANK.critical ? 'critical' : topRank >= SEVERITY_RANK.warning ? 'warning' : 'ok';

  return { metrics, anomalies, status };
}

// ─────────────────────────────────────────────────────────────────────
// Convenience: compact summary for status badges
// ─────────────────────────────────────────────────────────────────────

export interface DayStatusSummary {
  status: ReviewStatus;
  count: number;
  topLabel: string | null;
}

export function summarizeForBadge(result: AdminTimeReviewResult): DayStatusSummary {
  const top = [...result.anomalies].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )[0];
  return {
    status: result.status,
    count: result.anomalies.length,
    topLabel: top?.label ?? null,
  };
}
