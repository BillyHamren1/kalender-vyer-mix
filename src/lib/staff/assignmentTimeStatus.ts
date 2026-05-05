/**
 * assignmentTimeStatus
 * --------------------------------------------------------------------------
 * Gemensam beräkning av "tidsstatus" per (staff, date, target) som används av
 *   - personalkalendern (badge per assignment)
 *   - projektvyn (badge per pass)
 *   - tidrapportvyn (status-pill per rad)
 *
 * Pure helper utan DB-anrop – datat hämtas av en hook och matas in.
 *
 * Status-prioritet (högst först):
 *   needs_review     – workday.review_status='needs_review' eller hård flag
 *   done             – godkänd time_report eller workday.ended_at + matchande TR
 *   timer_running    – aktiv LTE (exited_at = null) mot detta target
 *   auto_started     – aktiv LTE där source/metadata indikerar auto-arrival
 *   on_site          – workday startad + (matchande LTE eller gpsOnSite)
 *   missing_workday  – LTE/TR finns men ingen workday startad
 *   not_started      – inget av ovan
 */

export type AssignmentTimeStatus =
  | 'not_started'
  | 'on_site'
  | 'timer_running'
  | 'auto_started'
  | 'missing_workday'
  | 'done'
  | 'needs_review';

export interface AtsTarget {
  bookingId?: string | null;
  largeProjectId?: string | null;
}

export interface AtsWorkday {
  started_at: string | null;
  ended_at: string | null;
  review_status?: string | null;
}

export interface AtsLte {
  id: string;
  booking_id: string | null;
  large_project_id: string | null;
  entered_at: string;
  exited_at: string | null;
  total_minutes: number | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AtsTimeReport {
  id: string;
  booking_id: string | null;
  large_project_id: string | null;
  hours_worked: number;
  approved: boolean | null;
  is_subdivision: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface AtsWorkdayFlag {
  flag_type: string;
  severity?: string | null; // 'info' | 'warning' | 'error'
}

export interface AtsInput {
  target: AtsTarget;
  workday: AtsWorkday | null;
  lteRows: AtsLte[];
  timeReports: AtsTimeReport[];
  workdayFlags: AtsWorkdayFlag[];
  gpsOnSite?: boolean;
}

export interface AtsResult {
  status: AssignmentTimeStatus;
  /** Faktiskt rapporterade/aktiva minuter mot detta target hittills. */
  actualMinutes: number;
  /** Är någon timer mot target aktiv just nu. */
  hasActiveTimer: boolean;
  /** Auto-arrival flagga (geofence) för aktiv timer. */
  autoStarted: boolean;
  /** Anomalier som triggade needs_review. */
  reviewReasons: string[];
}

const matchesTarget = (
  row: { booking_id: string | null; large_project_id: string | null },
  target: AtsTarget,
): boolean => {
  if (target.largeProjectId && row.large_project_id === target.largeProjectId) return true;
  if (target.bookingId && row.booking_id === target.bookingId) return true;
  return false;
};

const isAutoSource = (lte: AtsLte): boolean => {
  const src = (lte.source || '').toLowerCase();
  if (src.includes('auto') || src === 'geofence') return true;
  const m = lte.metadata || {};
  if (typeof m === 'object' && m !== null) {
    const trigger = String((m as any).trigger || (m as any).origin || '').toLowerCase();
    if (trigger.includes('auto') || trigger.includes('arrival') || trigger.includes('geofence')) return true;
  }
  return false;
};

const HARD_REVIEW_FLAGS = new Set([
  'unclear_day_end',
  'presence_without_report',
  'activity_ended_day_left_open',
  'geofence_mismatch',
  'planned_signal_gap',
]);

export const computeAssignmentTimeStatus = (input: AtsInput): AtsResult => {
  const { target, workday, lteRows, timeReports, workdayFlags, gpsOnSite } = input;

  const matchingLtes = lteRows.filter(r => matchesTarget(r, target));
  const matchingTrs = timeReports.filter(r => !r.is_subdivision && matchesTarget(r, target));

  const activeLte = matchingLtes.find(r => !r.exited_at) || null;
  const closedLteMinutes = matchingLtes
    .filter(r => r.exited_at)
    .reduce((sum, r) => sum + (r.total_minutes || 0), 0);
  const trMinutes = matchingTrs.reduce((sum, r) => sum + Math.round((r.hours_worked || 0) * 60), 0);

  // Active timer minutes = now - entered_at
  let activeMinutes = 0;
  if (activeLte) {
    const start = Date.parse(activeLte.entered_at);
    if (Number.isFinite(start)) {
      activeMinutes = Math.max(0, Math.round((Date.now() - start) / 60000));
    }
  }
  // TR vinner över LTE per dedupreglerna i projectTimeModel
  const actualMinutes = Math.max(trMinutes, closedLteMinutes) + activeMinutes;

  const reviewReasons: string[] = [];
  if (workday?.review_status === 'needs_review') reviewReasons.push('workday_review');
  for (const f of workdayFlags) {
    if (HARD_REVIEW_FLAGS.has(f.flag_type) || f.severity === 'error') {
      reviewReasons.push(f.flag_type);
    }
  }

  let status: AssignmentTimeStatus = 'not_started';

  if (reviewReasons.length > 0) {
    status = 'needs_review';
  } else if (matchingTrs.some(r => r.approved) || (workday?.ended_at && matchingTrs.length > 0)) {
    status = 'done';
  } else if (activeLte) {
    status = isAutoSource(activeLte) ? 'auto_started' : 'timer_running';
  } else if (workday?.started_at && (matchingLtes.length > 0 || gpsOnSite)) {
    status = 'on_site';
  } else if (!workday?.started_at && (matchingLtes.length > 0 || matchingTrs.length > 0)) {
    status = 'missing_workday';
  } else {
    status = 'not_started';
  }

  return {
    status,
    actualMinutes,
    hasActiveTimer: !!activeLte,
    autoStarted: !!activeLte && isAutoSource(activeLte),
    reviewReasons,
  };
};

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentTimeStatus, string> = {
  not_started: 'Ej startad',
  on_site: 'På plats',
  timer_running: 'Timer pågår',
  auto_started: 'Auto-startad',
  missing_workday: 'Saknar arbetsdag',
  done: 'Klar',
  needs_review: 'Kräver granskning',
};

/** Tailwind-klasser per status, semantiska tokens. */
export const ASSIGNMENT_STATUS_CLASS: Record<AssignmentTimeStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  on_site: 'bg-primary/15 text-primary',
  timer_running: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  auto_started: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  missing_workday: 'bg-amber-500/20 text-amber-800 dark:text-amber-200',
  done: 'bg-secondary text-secondary-foreground',
  needs_review: 'bg-destructive/15 text-destructive',
};
