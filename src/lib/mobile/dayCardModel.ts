import type { MobileTimeReport, MobileTravelLog } from '@/services/mobileApiService';

/**
 * Status för en dag i mobilens tidrapportvy.
 *
 * - `ongoing`  : workday pågår (ingen ended_at).
 * - `approved` : admin har godkänt workdayn.
 * - `error`    : verkligt fel som kräver korrigering (saknad start/slut,
 *                aktiv timer kvar, överlapp, över-rapportering, tekniskt fel).
 * - `ready`    : workday avslutad utan verkliga fel — redo för attest.
 *
 * VIKTIGT: Oallokerad/ofördelad tid är OK och är ALDRIG ett fel — den
 * räknas som lönegrundande genom workday och visas neutralt.
 */
export type DayStatus = 'ongoing' | 'ready' | 'approved' | 'error';

export interface DayCardWorkdayInput {
  id: string;
  started_at: string;
  ended_at: string | null;
  review_status?: 'draft' | 'needs_review' | 'ready' | 'approved' | string | null;
}

export interface DayCardInput {
  /** ISO date (yyyy-MM-dd) for the day. */
  date: string;
  /** Workday-row för dagen (om någon). */
  workday: DayCardWorkdayInput | null;
  /** Time_reports som tillhör dagen. */
  reports: MobileTimeReport[];
  /** Travel logs som tillhör dagen. */
  travelLogs?: MobileTravelLog[];
  /** True om någon timer fortfarande är öppen på dagen. */
  hasActiveTimer?: boolean;
  /** Now (för pågående workday-elapsed). */
  now?: Date;
}

export interface DayCardModel {
  date: string;
  // Workday
  workdayStartIso: string | null;
  workdayEndIso: string | null;
  /** Total arbetstid (workday). 0 om ingen workday. */
  workdayMinutes: number;
  isWorkdayOpen: boolean;
  reviewApproved: boolean;
  // Distribution
  reportedMinutes: number;
  travelMinutes: number;
  distributedMinutes: number;
  /** Oallokerat = max(0, workday − fördelat). Visas neutralt, inte fel. */
  unallocatedMinutes: number;
  // Status & errors
  status: DayStatus;
  /**
   * Verkliga fel. Oallokerad tid räknas ALDRIG som fel.
   * Möjliga taggar:
   *   - 'workday_missing'  — det finns rapporter men ingen workday.
   *   - 'workday_no_end'   — workday-rad utan slut, men dagen är inte längre idag.
   *   - 'active_timer'     — timer fortfarande igång efter dagsslut.
   *   - 'overlap'          — två tidrapporter på dagen överlappar varandra.
   *   - 'over_distributed' — fördelad tid > workday-tid.
   */
  errors: DayError[];
  hasActiveTimer: boolean;
  hasOverlap: boolean;
  overDistributed: boolean;
}

export type DayErrorKind =
  | 'workday_missing'
  | 'workday_no_end'
  | 'active_timer'
  | 'overlap'
  | 'over_distributed';

export interface DayError {
  kind: DayErrorKind;
  /** Kort svensk etikett — visas direkt i UI. */
  label: string;
  /** Längre beskrivning för tooltip/expandera. */
  detail: string;
}

const MS_PER_MIN = 60_000;

function toMinutes(hours: number | null | undefined): number {
  if (!hours || !Number.isFinite(hours)) return 0;
  return Math.max(0, Math.round(hours * 60));
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_MIN));
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameYmd(iso: string, ymd: string): boolean {
  // Compare just the date portion of an ISO timestamp.
  return iso.slice(0, 10) === ymd;
}

function detectOverlap(reports: MobileTimeReport[]): boolean {
  const ranges = reports
    .map((r) => {
      if (!r.start_time || !r.end_time) return null;
      // start_time/end_time can be 'HH:mm:ss' or full ISO.
      const start = r.start_time.length <= 8
        ? hmsToMinutes(r.start_time)
        : minutesFromIso(r.start_time);
      const end = r.end_time.length <= 8
        ? hmsToMinutes(r.end_time)
        : minutesFromIso(r.end_time);
      if (start == null || end == null || end <= start) return null;
      return { start, end };
    })
    .filter((x): x is { start: number; end: number } => !!x)
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) return true;
  }
  return false;
}

function hmsToMinutes(s: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesFromIso(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Bygg per-dag-modell för mobilens tidrapportvy.
 *
 * MODELL:
 *   - workday      = total arbetstid / lönegrundande tid
 *   - time_reports = fördelning på projekt
 *   - travel       = fördelning enligt policy
 *   - oallokerat   = workday − fördelat (visas neutralt)
 *
 * Oallokerad tid blockerar ALDRIG attest.
 */
export function buildMobileDayCardModel(input: DayCardInput): DayCardModel {
  const now = input.now ?? new Date();
  const wd = input.workday;
  const wdStart = parseIso(wd?.started_at ?? null);
  const wdEnd = parseIso(wd?.ended_at ?? null);
  const isWorkdayOpen = !!wd && !wd.ended_at;

  // Workday total minutes — open workdays räknas mot now (lönegrundande
  // hittills) men errors ska bara triggas på avslutad/förfallen dag.
  const workdayMinutes = wdStart
    ? diffMinutes(wdStart, wdEnd ?? now)
    : 0;

  const reportedMinutes = input.reports.reduce(
    (sum, r) => sum + toMinutes(r.hours_worked),
    0,
  );
  const travelMinutes = (input.travelLogs ?? [])
    .filter((t) => !!t.end_time)
    .reduce((sum, t) => sum + toMinutes(t.hours_worked), 0);

  const distributedRaw = reportedMinutes + travelMinutes;
  // Distributed cap:as inte här — vi vill kunna upptäcka över-rapportering.
  const distributedMinutes = distributedRaw;
  const unallocatedMinutes =
    workdayMinutes > 0
      ? Math.max(0, workdayMinutes - distributedMinutes)
      : 0;

  const overDistributed =
    workdayMinutes > 0 && distributedMinutes > workdayMinutes + 1; // 1 min tolerans
  const hasOverlap = detectOverlap(input.reports);
  const hasActiveTimer = !!input.hasActiveTimer;

  // ── Real errors ───────────────────────────────────────────────────
  const errors: DayError[] = [];

  // workday saknas men det finns rapporter på dagen → riktigt fel
  if (!wd && input.reports.length > 0) {
    errors.push({
      kind: 'workday_missing',
      label: 'Saknad arbetsdag',
      detail: 'Det finns tidrapporter men ingen arbetsdag är registrerad.',
    });
  }

  // workday-rad utan slut, och vi är inte längre kvar på samma dag
  // (dvs öppen workday > 24h efter dess startdatum).
  if (wd && !wd.ended_at && wdStart) {
    const isToday = isSameYmd(wdStart.toISOString(), input.date);
    const elapsedHours = (now.getTime() - wdStart.getTime()) / 3_600_000;
    if (!isToday || elapsedHours > 18) {
      errors.push({
        kind: 'workday_no_end',
        label: 'Saknad sluttid',
        detail: 'Arbetsdagen avslutades aldrig.',
      });
    }
  }

  if (hasActiveTimer && !!wd?.ended_at) {
    errors.push({
      kind: 'active_timer',
      label: 'Aktiv timer kvar',
      detail: 'En timer är fortfarande igång efter att arbetsdagen avslutades.',
    });
  }

  if (hasOverlap) {
    errors.push({
      kind: 'overlap',
      label: 'Överlapp',
      detail: 'Två tidrapporter på dagen överlappar varandra.',
    });
  }

  if (overDistributed) {
    errors.push({
      kind: 'over_distributed',
      label: 'För mycket rapporterat',
      detail:
        'Mer projekt-/restid är rapporterad än vad arbetsdagen tillåter.',
    });
  }

  // ── Status ────────────────────────────────────────────────────────
  const reviewApproved = wd?.review_status === 'approved';

  let status: DayStatus;
  if (reviewApproved) status = 'approved';
  else if (errors.length > 0) status = 'error';
  else if (isWorkdayOpen) status = 'ongoing';
  else status = 'ready';

  return {
    date: input.date,
    workdayStartIso: wd?.started_at ?? null,
    workdayEndIso: wd?.ended_at ?? null,
    workdayMinutes,
    isWorkdayOpen,
    reviewApproved,
    reportedMinutes,
    travelMinutes,
    distributedMinutes,
    unallocatedMinutes,
    status,
    errors,
    hasActiveTimer,
    hasOverlap,
    overDistributed,
  };
}

export function statusLabel(status: DayStatus): string {
  switch (status) {
    case 'ongoing':  return 'Pågår';
    case 'ready':    return 'Redo för attest';
    case 'approved': return 'Godkänd';
    case 'error':    return 'Kräver korrigering';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot-driven builder.
//
// When the mobile app already has a server-built StaffDaySnapshot from the
// `get-staff-day-status` Edge Function, we MUST use that as the source of
// truth instead of recombining workdays/time_reports/travel_logs locally.
// This keeps admin and mobile views in lockstep.
// ─────────────────────────────────────────────────────────────────────────────
export interface SnapshotLike {
  date: string;
  workday: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    isOpen: boolean;
    reviewStatus: string | null;
    approved: boolean;
    durationMinutes: number;
  } | null;
  active: { startedAt: string; durationMinutes: number } | null;
  totals: {
    workdayMinutes: number;
    allocatedProjectMinutes: number;
    travelMinutes: number;
    unallocatedMinutes: number;
    isWorkdayOpen: boolean;
  };
  flags: Array<{ type: string; severity: 'info' | 'warning' | 'error'; title: string; description: string | null }>;
}

export function buildDayCardModelFromSnapshot(snap: SnapshotLike): DayCardModel {
  const wd = snap.workday;
  const reportedMinutes = snap.totals.allocatedProjectMinutes;
  const travelMinutes = snap.totals.travelMinutes;
  const distributedMinutes = reportedMinutes + travelMinutes;
  const workdayMinutes = snap.totals.workdayMinutes;
  const unallocatedMinutes = snap.totals.unallocatedMinutes;

  // Map server flags → local DayError taxonomy (only the ones the card cares about).
  const errors: DayError[] = [];
  for (const f of snap.flags) {
    if (f.type === 'missing_workday') {
      errors.push({ kind: 'workday_missing', label: f.title, detail: f.description ?? '' });
    } else if (f.type === 'missing_end_time') {
      errors.push({ kind: 'workday_no_end', label: f.title, detail: f.description ?? '' });
    } else if (f.type === 'overlap') {
      errors.push({ kind: 'overlap', label: f.title, detail: f.description ?? '' });
    }
  }
  const overDistributed = workdayMinutes > 0 && distributedMinutes > workdayMinutes + 1;
  if (overDistributed) {
    errors.push({
      kind: 'over_distributed',
      label: 'För mycket rapporterat',
      detail: 'Mer projekt-/restid är rapporterad än vad arbetsdagen tillåter.',
    });
  }
  const hasActiveTimer = !!snap.active;
  if (hasActiveTimer && wd?.endedAt) {
    errors.push({
      kind: 'active_timer',
      label: 'Aktiv timer kvar',
      detail: 'En timer är fortfarande igång efter att arbetsdagen avslutades.',
    });
  }

  const reviewApproved = !!wd?.approved;
  let status: DayStatus;
  if (reviewApproved) status = 'approved';
  else if (errors.length > 0) status = 'error';
  else if (snap.totals.isWorkdayOpen) status = 'ongoing';
  else status = 'ready';

  return {
    date: snap.date,
    workdayStartIso: wd?.startedAt ?? null,
    workdayEndIso: wd?.endedAt ?? null,
    workdayMinutes,
    isWorkdayOpen: snap.totals.isWorkdayOpen,
    reviewApproved,
    reportedMinutes,
    travelMinutes,
    distributedMinutes,
    unallocatedMinutes,
    status,
    errors,
    hasActiveTimer,
    hasOverlap: errors.some((e) => e.kind === 'overlap'),
    overDistributed,
  };
}
