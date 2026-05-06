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
  | 'missing_logout'
  | 'planned_no_start';

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
    // Oallokerad tid är OK — visas som info, blockerar inte attest.
    // Det viktiga är att arbetsdagens start/slut är korrekta; allt
    // som inte är fördelat på projekt/resa är fortfarande lönegrundande.
    anomalies.push({
      kind: 'unallocated_time',
      severity: 'info',
      label: 'Ej fördelat på projekt',
      detail: `${unallocatedMinutes} min av arbetsdagen är inte fördelad på projekt eller restid.`,
      minutes: unallocatedMinutes,
    });
  }

  // Planerad men har inte startat någon timer / rapport.
  // Triggar när det finns planerade jobb och planeradStart har passerat
  // (med tolerans), men inga workEntries och ingen öppen timer.
  if (
    plannedStart &&
    !firstActualStart &&
    !openTimerStart &&
    realEntries.length === 0 &&
    now.getTime() > plannedStart.getTime() + lateTol * 60_000
  ) {
    const lateMin = diffMinutes(now, plannedStart);
    anomalies.push({
      kind: 'planned_no_start',
      severity: lateMin > 60 ? 'critical' : 'warning',
      label: 'Ej startat',
      detail: `Planerad start ${lateMin} min sedan men ingen timer/rapport finns.`,
      minutes: lateMin,
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

// ─────────────────────────────────────────────────────────────────────
// Day-level approvability
// ─────────────────────────────────────────────────────────────────────

export type ApprovalBlocker =
  | 'workday_missing'
  | 'workday_open'
  | 'open_timer'
  | 'pending_assistant_events'
  | 'unresolved_critical_anomaly';

export interface ApprovabilityResult {
  /** True when admin can approve directly without override. */
  canApprove: boolean;
  /** True when only critical anomalies remain — admin may force-approve with reason. */
  canOverride: boolean;
  /** Hard blockers that even override cannot bypass (e.g. open timer). */
  blockers: ApprovalBlocker[];
  /** Critical anomalies that require an override reason. */
  criticalAnomalies: ReviewAnomaly[];
  /** Short Swedish summary for tooltips. */
  reason: string | null;
}

/**
 * evaluateDayApprovability — gate for the "Godkänn dag"-button.
 *
 * Hard blockers (cannot be overridden):
 *   - workday row is missing
 *   - workday is still open (no ended_at)
 *   - an active timer is still running
 *   - pending workday-assistant events
 *
 * Soft blockers (override with comment is allowed):
 *   - any anomaly with severity = 'critical' that isn't already covered
 *     by a hard blocker
 */
export function evaluateDayApprovability(
  result: AdminTimeReviewResult,
  context: {
    workday: ReviewWorkdayInput | null;
    openTimer?: ReviewOpenTimer | null;
    assistantEvents?: ReviewAssistantEvent[];
  },
): ApprovabilityResult {
  const blockers: ApprovalBlocker[] = [];

  if (!context.workday) blockers.push('workday_missing');
  else if (!context.workday.ended_at) blockers.push('workday_open');

  if (context.openTimer) blockers.push('open_timer');

  const pending = (context.assistantEvents ?? []).filter((e) => !e.acknowledged).length;
  if (pending > 0) blockers.push('pending_assistant_events');

  const criticalAnomalies = result.anomalies.filter(
    (a) =>
      a.severity === 'critical' &&
      // 'open_timer_stale' and 'missing_logout' are already hard blockers
      a.kind !== 'open_timer_stale' &&
      a.kind !== 'missing_logout',
  );

  if (criticalAnomalies.length > 0) blockers.push('unresolved_critical_anomaly');

  const hardBlockers = blockers.filter((b) => b !== 'unresolved_critical_anomaly');
  const canOverride = hardBlockers.length === 0 && criticalAnomalies.length > 0;
  const canApprove = blockers.length === 0;

  let reason: string | null = null;
  if (blockers.includes('workday_missing')) reason = 'Ingen arbetsdag registrerad.';
  else if (blockers.includes('workday_open')) reason = 'Arbetsdagen är fortfarande öppen.';
  else if (blockers.includes('open_timer')) reason = 'En aktivitet är fortfarande igång.';
  else if (blockers.includes('pending_assistant_events'))
    reason = `${pending} assistent-händelser väntar på bekräftelse.`;
  else if (blockers.includes('unresolved_critical_anomaly'))
    reason = `${criticalAnomalies.length} kritiska avvikelser kräver override.`;

  return { canApprove, canOverride, blockers, criticalAnomalies, reason };
}

// ─────────────────────────────────────────────────────────────────────
// Day approval state — single source of truth for the 4-state UX
// ─────────────────────────────────────────────────────────────────────

/**
 * 4-stegs dagstatus som speglar attestflödet:
 *
 *   - 'in_progress'        — workday öppen, eller ingen workday alls men
 *                             personalen är registrerad (timer/rapport pågår).
 *   - 'ready_for_approval' — workday har start + slut, ingen aktiv timer,
 *                             ingen överrapportering, inga hårda
 *                             tekniska fel. **Oallokerad tid blockerar inte.**
 *   - 'approved'           — workdays.review_status='approved'.
 *   - 'requires_correction'— hårda fel: överrapportering, saknad
 *                             utloggning, öppen workday äldre än 18h,
 *                             pending assistent-händelser, eller andra
 *                             critical anomalies som inte är override-bara.
 *
 * Modell:
 *   - Stängd workday = attestbar dagsrapport.
 *   - time_reports = fördelning *inom* dagen (kan justeras i attestflödet).
 *   - Oallokerad tid räknas som info, aldrig blockerande.
 */
export type DayApprovalState =
  | 'in_progress'
  | 'ready_for_approval'
  | 'approved'
  | 'requires_correction';

export interface DayApprovalStateResult {
  state: DayApprovalState;
  /** Kort svensk etikett för chip/knapp. */
  label: string;
  /** Längre tooltip-text. */
  detail: string;
}

const STATE_LABELS: Record<DayApprovalState, { label: string; detail: string }> = {
  in_progress: { label: 'Pågår', detail: 'Arbetsdagen är ännu inte avslutad.' },
  ready_for_approval: {
    label: 'Redo för attest',
    detail: 'Arbetsdagen är stängd och kan godkännas. Eventuell oallokerad tid blockerar inte.',
  },
  approved: { label: 'Godkänd', detail: 'Dagen är godkänd som dagsrapport.' },
  requires_correction: {
    label: 'Kräver korrigering',
    detail: 'Hårda fel finns (t.ex. överrapportering, saknad utloggning eller öppen timer).',
  },
};

/**
 * evaluateDayApprovalState — härleder den 4-stegs status som UI:t visar.
 *
 * Hierarki (högst till lägst):
 *   1. approved  (reviewStatus='approved')
 *   2. requires_correction (hårda fel som inte bara är "open workday")
 *   3. in_progress (workday saknas eller är fortfarande öppen,
 *                   utan andra hårda fel)
 *   4. ready_for_approval (alla grindar uppfyllda)
 */
export function evaluateDayApprovalState(
  result: AdminTimeReviewResult,
  context: {
    workday: ReviewWorkdayInput | null;
    openTimer?: ReviewOpenTimer | null;
    assistantEvents?: ReviewAssistantEvent[];
    reviewStatus?: 'open' | 'needs_review' | 'approved' | string | null;
  },
): DayApprovalStateResult {
  if (context.reviewStatus === 'approved') {
    return { state: 'approved', ...STATE_LABELS.approved };
  }

  const ap = evaluateDayApprovability(result, context);

  // Pågår: workday saknas helt eller är fortfarande öppen.
  // Ingen aktiv timer/pending assistant räknas också som "pågår" —
  // användaren har inte stängt sin dag ännu, det är inte ett fel.
  if (ap.blockers.includes('workday_missing') || ap.blockers.includes('workday_open')) {
    // Men om det finns andra hårda fel (overlap, over_distributed osv.)
    // ska "Kräver korrigering" vinna så admin inte missar dem.
    const hasHardError = result.anomalies.some(
      (a) =>
        a.severity === 'critical' &&
        a.kind !== 'open_timer_stale' &&
        a.kind !== 'missing_logout' &&
        a.kind !== 'planned_no_start',
    );
    if (hasHardError) {
      return { state: 'requires_correction', ...STATE_LABELS.requires_correction };
    }
    return { state: 'in_progress', ...STATE_LABELS.in_progress };
  }

  // Aktiv timer kvar efter stängd workday → kräver korrigering.
  if (ap.blockers.includes('open_timer')) {
    return { state: 'requires_correction', ...STATE_LABELS.requires_correction };
  }

  // Pending assistent-händelser blockerar attest men är ingen "fel" i sig.
  // Visa som "Kräver korrigering" så admin agerar.
  if (ap.blockers.includes('pending_assistant_events')) {
    return { state: 'requires_correction', ...STATE_LABELS.requires_correction };
  }

  // Soft critical (over_distributed > 30, planned_no_start > 60 osv.) →
  // kräver korrigering (admin kan välja override-flödet om hen vill).
  if (ap.criticalAnomalies.length > 0) {
    return { state: 'requires_correction', ...STATE_LABELS.requires_correction };
  }

  // Annars: redo för attest. Oallokerad tid (info) räknas inte här.
  return { state: 'ready_for_approval', ...STATE_LABELS.ready_for_approval };
}
