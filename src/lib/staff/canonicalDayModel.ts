/**
 * buildCanonicalStaffDayModel — single source of truth for "what does
 * this staff member's day look like for payroll & review?"
 *
 * MENTAL MODEL (EventFlow):
 *   - workdays.started_at..ended_at  →  the SHIFT envelope.
 *   - workday duration − rast        →  PAYABLE TIME (lönegrundande).
 *   - time_reports                   →  internal DISTRIBUTION of payable
 *                                       time onto projects/locations/
 *                                       lager. NEVER the source for
 *                                       payable time itself.
 *   - travel_time_logs               →  SUGGESTED travel — only counts
 *                                       once explicitly approved /
 *                                       converted into a time_report.
 *   - location_time_entries          →  technical timer rows; promoted
 *                                       location-timers already create a
 *                                       time_report so don't double-count.
 *   - GPS pings / assistant_events   →  evidence + suggestions only.
 *
 * Pure / UI-agnostic. No DB, no React.
 */

export interface CanonicalWorkdayInput {
  started_at: string;
  ended_at: string | null;
}

/** A row from `time_reports` that represents an internal distribution of
 *  payable time onto a project/booking/location/etc. */
export interface CanonicalDistributionRowInput {
  id: string;
  /** ISO timestamp or null when ongoing. */
  start: string | null;
  end: string | null;
  /** Hours that this row contributes to distribution. */
  hours: number;
  /** Optional break inside this row (hours). Subtracted from totals. */
  breakHours?: number;
  /** Display label (project / location / lager / etc.). */
  label: string;
  /** Source category — used by callers to pick icons. */
  category: 'project' | 'location' | 'lager' | 'other';
  approved?: boolean;
  /** Subdivisions are metadata, not paid time. */
  isSubdivision?: boolean;
}

export interface CanonicalActiveTimerInput {
  id: string;
  startedAt: string;
  label: string;
  /** 'time_report' | 'location_entry' | 'travel' — drives icon/label. */
  source: 'time_report' | 'location_entry' | 'travel';
  /** Already saved as a time_report? Then it is NOT pending. */
  reportedAsDistribution?: boolean;
}

export interface CanonicalActiveTimerRow extends CanonicalActiveTimerInput {
  /** Minutes since the timer started (capped at "now"). */
  runningMinutes: number;
  /** True when the latest GPS ping is older than the stale threshold. */
  signalLost: boolean;
  /** Last ping age in minutes, or null when never pinged. */
  lastPingAgeMin: number | null;
}

export interface CanonicalTravelSuggestionInput {
  id: string;
  start: string | null;
  end: string | null;
  hours: number;
  fromAddress: string | null;
  toAddress: string | null;
  /** True when this travel has been approved (admin/staff confirmed it).
   *  Approved travel counts as DISTRIBUTION inside workday — never as
   *  extra payable time on top of workday. */
  approved?: boolean;
  /** travel_time_logs.auto_detected — geofence/movement-detected. */
  autoDetected?: boolean;
  /** travel_time_logs.source — 'gap_derived' = inferred from time gaps. */
  sourceTag?: string | null;
  /** Resolved destination booking/project — when missing the row is
   *  always review-required and never counted as distributed time. */
  destinationBookingId?: string | null;
}

export interface CanonicalTravelSuggestionRow extends CanonicalTravelSuggestionInput {
  /** True when admin/staff must act before this row can be counted:
   *  missing destination, or approved=false. */
  reviewRequired: boolean;
  /** Stable reason flag for UI. */
  reviewReason: 'missing_destination' | 'pending_approval' | null;
}

export interface CanonicalGpsEvidenceInput {
  pingsCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;
  placesVisited: number;
}

/** Latest GPS ping for the staff member (used to detect "tappad signal"). */
export interface CanonicalLatestPingInput {
  updatedAt: string | null;
}

export type CanonicalAnomalyKind =
  | 'workday_missing_but_reports_exist'
  | 'over_distributed'
  | 'large_undistributed'
  | 'workday_open_stale'
  | 'open_timer_signal_lost'
  | 'travel_missing_destination';

export interface CanonicalAnomaly {
  kind: CanonicalAnomalyKind;
  severity: 'info' | 'warning' | 'critical';
  label: string;
  detail: string;
  minutes: number;
}

export interface BuildCanonicalDayInput {
  workdays?: CanonicalWorkdayInput[];
  distributionRows: CanonicalDistributionRowInput[];
  activeTimers?: CanonicalActiveTimerInput[];
  travelSuggestions?: CanonicalTravelSuggestionInput[];
  gpsEvidence?: CanonicalGpsEvidenceInput | null;
  /** Latest GPS ping for the staff (used for stale-signal detection). */
  latestPing?: CanonicalLatestPingInput | null;
  /** Test-injectable clock. */
  now?: Date;
}

export interface CanonicalStaffDayModel {
  workdayStart: string | null;
  workdayEnd: string | null;
  isWorkdayOpen: boolean;
  workdayMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  distributedMinutes: number;
  undistributedMinutes: number;
  overDistributedMinutes: number;
  suggestedTravelMinutes: number;
  approvedTravelMinutes: number;
  /** Sum of running minutes for OPEN timers — never paid until closed. */
  activeTimerMinutes: number;
  /** True when at least one open timer's last GPS ping is stale. */
  hasSignalLost: boolean;
  activeTimerRows: ReadonlyArray<CanonicalActiveTimerRow>;
  distributionRows: ReadonlyArray<CanonicalDistributionRowInput>;
  travelSuggestions: ReadonlyArray<CanonicalTravelSuggestionRow>;
  gpsEvidence: CanonicalGpsEvidenceInput | null;
  latestPingAgeMin: number | null;
  anomalies: ReadonlyArray<CanonicalAnomaly>;
  reviewRequired: boolean;
  status:
    | 'no_workday'
    | 'requires_distribution'
    | 'over_reported'
    | 'open'
    | 'ok';
}

const MS_PER_MIN = 60_000;
/** Tolerance for "ofördelad tid" warnings (minutes). Anything below is
 *  considered noise (rounding, micro-gaps). */
const UNDISTRIBUTED_NOISE_MIN = 5;
/** Open workday is "stale" after this many hours without an end. */
const STALE_OPEN_WORKDAY_HOURS = 18;
/** A timer is "tappad signal" when last GPS ping is older than this. */
const STALE_PING_MIN = 10;

const safeMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

const minutesBetween = (a: number, b: number): number =>
  Math.max(0, Math.round((b - a) / MS_PER_MIN));

const hoursToMinutes = (h: number | undefined | null): number => {
  if (!h || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.round(h * 60));
};

/**
 * Collapse multiple workday rows into one envelope per day:
 *   start = earliest started_at
 *   end   = latest ended_at, or null when any row is still open.
 */
function collapseWorkdays(
  workdays: CanonicalWorkdayInput[] | undefined,
): { start: string | null; end: string | null; open: boolean } {
  if (!workdays || workdays.length === 0) {
    return { start: null, end: null, open: false };
  }
  const starts = workdays
    .map((w) => safeMs(w.started_at))
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  const open = workdays.some((w) => !w.ended_at);
  const ends = workdays
    .map((w) => safeMs(w.ended_at))
    .filter((x): x is number => x != null)
    .sort((a, b) => b - a);
  return {
    start: starts[0] != null ? new Date(starts[0]).toISOString() : null,
    end: open ? null : ends[0] != null ? new Date(ends[0]).toISOString() : null,
    open,
  };
}

export function buildCanonicalStaffDayModel(
  input: BuildCanonicalDayInput,
): CanonicalStaffDayModel {
  const now = (input.now ?? new Date()).getTime();
  const wd = collapseWorkdays(input.workdays);

  const startMs = safeMs(wd.start);
  const endMs = wd.open ? now : safeMs(wd.end);
  const workdayMinutes =
    startMs != null && endMs != null && endMs > startMs
      ? minutesBetween(startMs, endMs)
      : 0;

  // Distribution: subdivisions are metadata, not payable time.
  const realRows = input.distributionRows.filter((r) => !r.isSubdivision);

  const breakMinutes = realRows.reduce(
    (s, r) => s + hoursToMinutes(r.breakHours),
    0,
  );

  const distributedMinutes = realRows.reduce(
    (s, r) => s + hoursToMinutes(r.hours),
    0,
  );

  // Travel suggestions: classify each row.
  //   - missing destination → review_required, NEVER counted as anything
  //     except a "suggestion" (won't reduce undistributed).
  //   - approved=false      → review_required, counted as SUGGESTED only.
  //   - approved=true       → counted as DISTRIBUTION inside workday.
  // Approved travel is ADDED to distributedMinutes (so it eats undistributed
  // tid) but it is CAPPED so the day's total fördelning aldrig blir större
  // än lönegrundande tid (workday − rast).
  const rawTravel = input.travelSuggestions ?? [];
  const travel: CanonicalTravelSuggestionRow[] = rawTravel.map((t) => {
    const missingDestination = !t.destinationBookingId && !t.toAddress;
    let reviewReason: 'missing_destination' | 'pending_approval' | null = null;
    if (missingDestination) reviewReason = 'missing_destination';
    else if (!t.approved) reviewReason = 'pending_approval';
    return {
      ...t,
      reviewRequired: reviewReason !== null,
      reviewReason,
    };
  });

  const approvedDistributableTravel = travel.filter(
    (t) => t.approved && !t.reviewRequired,
  );
  const approvedTravelMinutes = approvedDistributableTravel.reduce(
    (s, t) => s + hoursToMinutes(t.hours),
    0,
  );
  const suggestedTravelMinutes = travel
    .filter((t) => t.reviewRequired || !t.approved)
    .reduce((s, t) => s + hoursToMinutes(t.hours), 0);

  const payableMinutes = Math.max(0, workdayMinutes - breakMinutes);

  // Approved travel räknas som fördelning inom workday, men aldrig så att
  // den totala fördelningen överstiger lönegrundande tid.
  const distributedTotalRaw = distributedMinutes + approvedTravelMinutes;
  const distributedTotal = payableMinutes > 0
    ? Math.min(distributedTotalRaw, payableMinutes)
    : distributedTotalRaw;

  const undistributedMinutes = Math.max(0, payableMinutes - distributedTotal);
  // Överrapportering räknas på time_reports + godkänd resa MOT workday —
  // travel ökar aldrig payable.
  const overDistributedMinutes = Math.max(0, distributedTotalRaw - payableMinutes);

  // ── Anomalies ───────────────────────────────────────────────────────
  const anomalies: CanonicalAnomaly[] = [];

  if (workdayMinutes === 0 && distributedMinutes > 0) {
    anomalies.push({
      kind: 'workday_missing_but_reports_exist',
      severity: 'warning',
      label: 'Saknar arbetsdag',
      detail:
        'Tidrapporter finns men ingen workday — granska och lägg in arbetsdagens start/slut.',
      minutes: distributedMinutes,
    });
  }

  if (overDistributedMinutes > 0) {
    anomalies.push({
      kind: 'over_distributed',
      severity: overDistributedMinutes > 30 ? 'critical' : 'warning',
      label: 'Överrapportering',
      detail: `${overDistributedMinutes} min mer fördelat än arbetsdagen tillåter (lönegrundande tid).`,
      minutes: overDistributedMinutes,
    });
  }

  if (
    workdayMinutes > 0 &&
    !wd.open &&
    undistributedMinutes > UNDISTRIBUTED_NOISE_MIN
  ) {
    // Ofördelad tid är OK — visas som info, blockerar inte attest.
    // Lönegrundande tid styrs av workday; fördelningen på projekt
    // är en sekundär uppgift som inte ska skrämma admin.
    anomalies.push({
      kind: 'large_undistributed',
      severity: 'info',
      label: 'Ej fördelat på projekt',
      detail: `${undistributedMinutes} min av lönegrundande tid är inte fördelad på något projekt.`,
      minutes: undistributedMinutes,
    });
  }

  if (
    wd.open &&
    startMs != null &&
    now - startMs > STALE_OPEN_WORKDAY_HOURS * 60 * MS_PER_MIN
  ) {
    anomalies.push({
      kind: 'workday_open_stale',
      severity: 'warning',
      label: 'Arbetsdag öppen för länge',
      detail: `Arbetsdagen har varit öppen i mer än ${STALE_OPEN_WORKDAY_HOURS} h utan slut.`,
      minutes: minutesBetween(startMs, now),
    });
  }

  const missingDestTravel = travel.filter((t) => t.reviewReason === 'missing_destination');
  if (missingDestTravel.length > 0) {
    anomalies.push({
      kind: 'travel_missing_destination',
      severity: 'warning',
      label: 'Resa saknar destination',
      detail: `${missingDestTravel.length} föreslagen resa saknar destination — kan inte godkännas som fördelad tid.`,
      minutes: missingDestTravel.reduce((s, t) => s + hoursToMinutes(t.hours), 0),
    });
  }

  // ── Active timers + stale GPS detection ────────────────────────────
  const lastPingMs = safeMs(input.latestPing?.updatedAt);
  const latestPingAgeMin =
    lastPingMs != null ? Math.max(0, Math.round((now - lastPingMs) / MS_PER_MIN)) : null;

  const activeTimerRows: CanonicalActiveTimerRow[] = (input.activeTimers ?? []).map((t) => {
    const startedMs = safeMs(t.startedAt);
    const runningMinutes =
      startedMs != null && now > startedMs ? minutesBetween(startedMs, now) : 0;
    const signalLost =
      latestPingAgeMin == null || latestPingAgeMin > STALE_PING_MIN;
    return {
      ...t,
      runningMinutes,
      signalLost,
      lastPingAgeMin: latestPingAgeMin,
    };
  });
  const activeTimerMinutes = activeTimerRows.reduce((s, r) => s + r.runningMinutes, 0);
  const hasSignalLost = activeTimerRows.some((r) => r.signalLost);

  if (hasSignalLost) {
    const lostCount = activeTimerRows.filter((r) => r.signalLost).length;
    anomalies.push({
      kind: 'open_timer_signal_lost',
      severity: 'warning',
      label: 'Tappad signal',
      detail: `${lostCount} pågående timer utan färsk GPS-ping (>${STALE_PING_MIN} min). Kräver granskning.`,
      minutes: 0,
    });
  }

  let status: CanonicalStaffDayModel['status'] = 'ok';
  if (workdayMinutes === 0 && distributedMinutes > 0) status = 'no_workday';
  else if (overDistributedMinutes > 0) status = 'over_reported';
  else if (wd.open) status = 'open';
  else if (undistributedMinutes > UNDISTRIBUTED_NOISE_MIN)
    status = 'requires_distribution';

  const reviewRequired =
    anomalies.length > 0 ||
    status === 'requires_distribution' ||
    status === 'no_workday' ||
    status === 'over_reported';

  return {
    workdayStart: wd.start,
    workdayEnd: wd.end,
    isWorkdayOpen: wd.open,
    workdayMinutes,
    breakMinutes,
    payableMinutes,
    // distributedMinutes = time_reports + APPROVED travel (kapade vid payable).
    // Speglar headerns "Fördelad tid"-pill.
    distributedMinutes: distributedTotal,
    undistributedMinutes,
    overDistributedMinutes,
    suggestedTravelMinutes,
    approvedTravelMinutes,
    activeTimerMinutes,
    hasSignalLost,
    activeTimerRows,
    distributionRows: realRows,
    travelSuggestions: travel,
    gpsEvidence: input.gpsEvidence ?? null,
    latestPingAgeMin,
    anomalies,
    reviewRequired,
    status,
  };
}

export const minutesToHours = (m: number): number => m / 60;
