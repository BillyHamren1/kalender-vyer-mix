/**
 * Day Evidence Layer (Time Engine 1.1)
 *
 * Responsibilities:
 *   - collect raw signals (GPS pings, assignments, known targets, private
 *     residence anchors, large project context)
 *   - normalize signal quality (counts, coverage, gaps, freshness)
 *   - expose diagnostics for downstream layers
 *   - keep planning as context only
 *   - never decide final work blocks
 *   - never create payroll / time report / LTE / display data
 *   - never mutate GPS pings, active_time_registrations or any DB row
 *
 * Boundary contracts:
 *   - Planning is context, not proof of location.
 *   - GPS / location evidence is handled later by Location Truth (1.2+).
 *   - Large project owns its own geo; child bookings are NOT geo fallback.
 *   - This layer must remain side-effect free and read-only.
 *
 * This file is intentionally a scaffold. Downstream callers must NOT consume
 * its output as work-block input until later phases wire it in explicitly.
 */

import {
  fetchAllStaffLocationPings,
  type FetchAllStaffLocationPingsDiagnostics,
} from '../timeEngine/fetchAllStaffLocationPings.ts';
import {
  normalizeGpsEvidence,
  type GpsNormalizationDiagnostics,
  type NormalizedGpsPing,
  type HardRejectedGpsPing,
} from './normalizeGpsEvidence.ts';
import {
  detectGpsOutliers,
  type GpsOutlierDiagnostics,
} from './detectGpsOutliers.ts';
import {
  buildAssignmentEvidence,
  type AssignmentEvidenceItem,
  type AssignmentEvidenceDiagnostics,
} from './buildAssignmentEvidence.ts';
import {
  buildKnownTargetsEvidence,
  type KnownTargetEvidenceItem,
  type KnownTargetsDataQuality,
  type KnownTargetsDiagnostics,
} from './buildKnownTargetsEvidence.ts';

// ── Pure helpers (Lager 1.7) ──────────────────────────────────────────────

/** Returnerar lokal timme [0..23] för iso-ts i given tz. */
function localHour(iso: string, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', hour12: false,
    });
    const h = parseInt(fmt.format(new Date(iso)), 10);
    return Number.isFinite(h) ? h % 24 : 0;
  } catch {
    return new Date(iso).getUTCHours();
  }
}

/** True om iso-ts ligger i nattfönstret 21:00–06:00 lokal tid. */
function isInNightWindow(iso: string, tz: string): boolean {
  const h = localHour(iso, tz);
  return h >= 21 || h < 6;
}

/** Coarse coverage ratio: andel hela minuter i [start..end] med någon ping. */
function computeCoverageRatio(
  pings: { ts: string }[],
  startUtc: string,
  endUtc: string,
): number {
  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  if (pings.length === 0) return 0;
  const covered = new Set<number>();
  for (const p of pings) {
    const t = Date.parse(p.ts);
    if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
    covered.add(Math.floor((t - startMs) / 60000));
  }
  return +(covered.size / totalMinutes).toFixed(4);
}

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface BuildDayEvidenceInput {
  /** Service-role Supabase client (admin). Read-only usage required. */
  supabaseAdmin: any;
  organizationId: string;
  staffId: string;
  /** YYYY-MM-DD (Stockholm-local). */
  date: string;
  /** IANA tz, defaults to Europe/Stockholm. */
  timezone?: string;
  /** Optional precomputed UTC day window. If omitted, derived from `date` as 00:00:00Z..23:59:59.999Z. */
  dayStartUtc?: string;
  dayEndUtc?: string;
}

// ── Sub-evidence shapes ────────────────────────────────────────────────────

export interface GpsPingsSummary {
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  qualityCounts: {
    excellent: number;
    good: number;
    usable: number;
    weak: number;
    veryWeak: number;
    outlierCandidate: number;
    unknown: number;
  };
  retainedLowAccuracyCount: number;
  ignoredForLocationLogicCount: number;
  hardRejectedCount: number;
}

export interface LocationLogicPingsSummary {
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  medianGapSeconds: number | null;
  maxGapMinutes: number | null;
}

export interface DayGpsEvidence {
  // ── Backwards-compat ───────────────────────────────────────────────────
  /** @deprecated Behåll: alias för fetchedPingCount. */
  pingCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;

  // ── Lager 1.7: explicita räkningar ────────────────────────────────────
  rawPingCount: number;
  fetchedPingCount: number;
  normalizedPingCount: number;
  /** Pings som faktiskt får användas i platslogik (ej hard reject, ej outlier-ignored). */
  locationLogicPingCount: number;
  hardRejectedPingCount: number;
  ignoredOutlierPingCount: number;

  /** Första/sista normaliserad ping (alla normaliserade, inkl. outliers). */
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  /** Första/sista ping i location-logic-setet. */
  firstLocationLogicPingAt: string | null;
  lastLocationLogicPingAt: string | null;

  medianAccuracyMeters: number | null;
  p90AccuracyMeters: number | null;

  /** Beräknat på locationLogicPings, inte raw. Gap > 15 min. */
  longGapCount: number;
  /** Största gap mellan två på varandra följande locationLogicPings i minuter. */
  maxGapMinutes: number | null;

  /** True om locationLogicPings finns mellan 21:00–06:00 lokal tid. */
  hasNightActivity: boolean;

  /** Andel av dagfönstrets minuter som har minst en locationLogicPing. */
  coverageRatio: number;

  // ── Lager 1.7: summaries ──────────────────────────────────────────────
  normalizedPingsSummary: GpsPingsSummary;
  locationLogicPingsSummary: LocationLogicPingsSummary;
}

export interface DayAssignmentEvidence {
  /** Total normaliserade assignment-rader (alla källor). */
  assignmentCount: number;
  /** Distinct booking ids referenced by assignments. */
  bookingIds: string[];
  /** Distinct large_project ids referenced by assignments (if any). */
  largeProjectIds: string[];
  /** True if planning marks this as a planned working day. */
  hasPlannedDay: boolean;
  /**
   * Detaljerad lista av planeringsrader (Lager 1.5).
   * PLANNING IS CONTEXT, NOT PROOF OF LOCATION.
   * Får INTE användas som location truth eller display-block.
   */
  items: AssignmentEvidenceItem[];
}

export interface DayKnownTargetsEvidence {
  /** organization_locations + project + booking + large_project + private targets resolved for the day. */
  totalCount: number;
  withCoordinatesCount: number;
  /** Targets explicitly invalid (missing_coordinates, test_data, cancelled…). */
  invalidCount: number;
  /**
   * Detaljerad lista (Lager 1.6). KNOWN TARGETS ÄR INTE BEVIS PÅ NÄRVARO.
   * Får INTE användas som location truth eller display-block.
   */
  items: KnownTargetEvidenceItem[];
  /** Strukturerade data quality-problem (Lager 1.6). */
  dataQuality: KnownTargetsDataQuality;
}

export interface DayPrivateResidenceEvidence {
  /** Private zones (home / manual_ignore / recurring_night) for this staff. */
  zoneCount: number;
  /** True if any zone has coordinates we can use for proximity. */
  hasUsableZone: boolean;
}

export interface DayLargeProjectEvidence {
  /** Distinct large projects tied to today's assignments. */
  count: number;
  /** Subset of those that expose own geo (lat/lng). */
  withOwnGeoCount: number;
}

export interface DayEvidenceDataQuality {
  gpsAvailable: boolean;
  assignmentsAvailable: boolean;
  knownTargetsAvailable: boolean;
  privateResidenceAvailable: boolean;
  largeProjectAvailable: boolean;
  /** Any non-fatal warnings produced while collecting evidence. */
  warnings: string[];
}

export interface DayEvidenceDiagnostics {
  staffId: string;
  date: string;
  timezone: string;
  builtAtIso: string;
  /** Total wall-clock ms spent building evidence. */
  buildDurationMs: number;
  /** Per-source error messages (null on success). */
  errors: {
    gps: string | null;
    assignments: string | null;
    knownTargets: string | null;
    privateResidence: string | null;
    largeProjects: string | null;
  };
  /** Mirrors DayEvidenceDataQuality.warnings for convenience. */
  warnings: string[];
  /** Counts snapshot for quick log scanning. */
  counts: {
    pings: number;
    assignments: number;
    knownTargets: number;
    privateZones: number;
    largeProjects: number;
  };
  /** Lager 1.7 — konsoliderad GPS-snapshot för Lager 2 + log scanning. */
  gps: {
    rawPingCount: number;
    fetchedPingCount: number;
    normalizedPingCount: number;
    locationLogicPingCount: number;
    hardRejectedPingCount: number;
    ignoredOutlierPingCount: number;
    retainedLowAccuracyCount: number;
    medianAccuracyMeters: number | null;
    p90AccuracyMeters: number | null;
    longGapCount: number;
    maxGapMinutes: number | null;
    coverageRatio: number;
    hasNightActivity: boolean;
  } | null;
  /** Diagnostics from the canonical paginated GPS reader (Lager 1.2). */
  gpsFetchDiagnostics: FetchAllStaffLocationPingsDiagnostics | null;
  /** Quality breakdown from GPS normalisation (Lager 1.3). */
  gpsNormalizationDiagnostics: GpsNormalizationDiagnostics | null;
  /** Outlier-detektering för location logic (Lager 1.4). */
  gpsOutlierDiagnostics: GpsOutlierDiagnostics | null;
  /** Assignment-evidence (Lager 1.5). PLANNING IS CONTEXT, NOT PROOF OF LOCATION. */
  assignmentEvidenceDiagnostics: AssignmentEvidenceDiagnostics | null;
  /** Known targets + data quality (Lager 1.6). KNOWN TARGETS = INTE BEVIS. */
  knownTargetsDiagnostics: KnownTargetsDiagnostics | null;
}

// ── Output ─────────────────────────────────────────────────────────────────

export interface DayEvidence {
  staffId: string;
  date: string;
  gps: DayGpsEvidence;
  assignments: DayAssignmentEvidence;
  knownTargets: DayKnownTargetsEvidence;
  privateResidence: DayPrivateResidenceEvidence;
  largeProjects: DayLargeProjectEvidence;
  dataQuality: DayEvidenceDataQuality;
  diagnostics: DayEvidenceDiagnostics;
  /**
   * Lager 1.7 — internt evidence-set för Lager 2-konsumtion.
   * Få aldrig serialiseras 1:1 utåt om mängden blir stor; expose via summary.
   * normalizedPings = alla normaliserade pings (inkl. outlier-ignored).
   * locationLogicPings = pings där hardRejected=false och ignoredForLocationLogic=false.
   */
  internal: {
    normalizedPings: NormalizedGpsPing[];
    locationLogicPings: NormalizedGpsPing[];
    hardRejectedPings: HardRejectedGpsPing[];
    dayWindowStartUtc: string;
    dayWindowEndUtc: string;
  };
}

// ── Safe defaults ──────────────────────────────────────────────────────────

const emptyGps = (): DayGpsEvidence => ({
  pingCount: 0,
  firstPingAt: null,
  lastPingAt: null,
  rawPingCount: 0,
  fetchedPingCount: 0,
  normalizedPingCount: 0,
  locationLogicPingCount: 0,
  hardRejectedPingCount: 0,
  ignoredOutlierPingCount: 0,
  firstRecordedAt: null,
  lastRecordedAt: null,
  firstLocationLogicPingAt: null,
  lastLocationLogicPingAt: null,
  medianAccuracyMeters: null,
  p90AccuracyMeters: null,
  longGapCount: 0,
  maxGapMinutes: null,
  hasNightActivity: false,
  coverageRatio: 0,
  normalizedPingsSummary: {
    count: 0,
    firstAt: null,
    lastAt: null,
    qualityCounts: {
      excellent: 0, good: 0, usable: 0, weak: 0, veryWeak: 0,
      outlierCandidate: 0, unknown: 0,
    },
    retainedLowAccuracyCount: 0,
    ignoredForLocationLogicCount: 0,
    hardRejectedCount: 0,
  },
  locationLogicPingsSummary: {
    count: 0,
    firstAt: null,
    lastAt: null,
    medianGapSeconds: null,
    maxGapMinutes: null,
  },
});

const emptyAssignments = (): DayAssignmentEvidence => ({
  assignmentCount: 0,
  bookingIds: [],
  largeProjectIds: [],
  hasPlannedDay: false,
  items: [],
});

const emptyKnownTargets = (): DayKnownTargetsEvidence => ({
  totalCount: 0,
  withCoordinatesCount: 0,
  invalidCount: 0,
  items: [],
  dataQuality: {
    targetsMissingCoordinates: [],
    targetsMissingRadius: [],
    largeProjectsMissingGeo: [],
    bookingsInsideLargeProjects: [],
    childBookingsSuppressedAsTargets: [],
    assignmentsWithoutMatchingTarget: [],
    calendarEventsWithoutTarget: [],
    targetsWithNullRadius: [],
  },
});

const emptyPrivateResidence = (): DayPrivateResidenceEvidence => ({
  zoneCount: 0,
  hasUsableZone: false,
});

const emptyLargeProjects = (): DayLargeProjectEvidence => ({
  count: 0,
  withOwnGeoCount: 0,
});

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * v1: scaffold only. Returns safe empty defaults plus diagnostics.
 *
 * Future phases will populate sub-evidence by reading:
 *   - gps_pings (read-only)
 *   - staff_assignments (read-only)
 *   - resolveWorkTargets() pure helper output
 *   - staff_private_zones (read-only)
 *   - large_projects (read-only)
 *
 * Until then, downstream MUST treat this as opaque diagnostics-only.
 */
export async function buildDayEvidence(
  input: BuildDayEvidenceInput,
): Promise<DayEvidence> {
  const startedAt = Date.now();
  const timezone = input.timezone ?? 'Europe/Stockholm';
  const warnings: string[] = [];

  const evidence: DayEvidence = {
    staffId: input.staffId,
    date: input.date,
    gps: emptyGps(),
    assignments: emptyAssignments(),
    knownTargets: emptyKnownTargets(),
    privateResidence: emptyPrivateResidence(),
    largeProjects: emptyLargeProjects(),
    dataQuality: {
      gpsAvailable: false,
      assignmentsAvailable: false,
      knownTargetsAvailable: false,
      privateResidenceAvailable: false,
      largeProjectAvailable: false,
      warnings,
    },
    diagnostics: {
      staffId: input.staffId,
      date: input.date,
      timezone,
      builtAtIso: new Date().toISOString(),
      buildDurationMs: 0,
      errors: {
        gps: null,
        assignments: null,
        knownTargets: null,
        privateResidence: null,
        largeProjects: null,
      },
      warnings,
      counts: {
        pings: 0,
        assignments: 0,
        knownTargets: 0,
        privateZones: 0,
        largeProjects: 0,
      },
      gpsFetchDiagnostics: null,
      gpsNormalizationDiagnostics: null,
      gpsOutlierDiagnostics: null,
      assignmentEvidenceDiagnostics: null,
      knownTargetsDiagnostics: null,
      gps: null,
    },
    internal: {
      normalizedPings: [],
      locationLogicPings: [],
      hardRejectedPings: [],
      dayWindowStartUtc: input.dayStartUtc ?? `${input.date}T00:00:00.000Z`,
      dayWindowEndUtc: input.dayEndUtc ?? `${input.date}T23:59:59.999Z`,
    },
  };

  // ── Lager 1.2: GPS via canonical paginated reader ────────────────────────
  const dayStartUtc = input.dayStartUtc ?? `${input.date}T00:00:00.000Z`;
  const dayEndUtc = input.dayEndUtc ?? `${input.date}T23:59:59.999Z`;
  evidence.internal.dayWindowStartUtc = dayStartUtc;
  evidence.internal.dayWindowEndUtc = dayEndUtc;
  let rawPingRows: any[] = [];
  let fetchedPingCount = 0;
  try {
    const fetchResult = await fetchAllStaffLocationPings({
      supabaseAdmin: input.supabaseAdmin,
      organizationId: input.organizationId,
      staffId: input.staffId,
      startUtc: dayStartUtc,
      endUtc: dayEndUtc,
      select: 'id, recorded_at, lat, lng, accuracy, speed',
    });
    evidence.diagnostics.gpsFetchDiagnostics = fetchResult.diagnostics;
    rawPingRows = fetchResult.rows ?? [];
    fetchedPingCount = fetchResult.diagnostics.totalFetched;
    evidence.gps.pingCount = fetchedPingCount;
    evidence.gps.fetchedPingCount = fetchedPingCount;
    evidence.gps.rawPingCount = fetchedPingCount;
    evidence.gps.firstPingAt = fetchResult.diagnostics.firstRecordedAt;
    evidence.gps.lastPingAt = fetchResult.diagnostics.lastRecordedAt;
    evidence.gps.firstRecordedAt = fetchResult.diagnostics.firstRecordedAt;
    evidence.gps.lastRecordedAt = fetchResult.diagnostics.lastRecordedAt;
    evidence.dataQuality.gpsAvailable = fetchedPingCount > 0;
    evidence.diagnostics.counts.pings = fetchedPingCount;
    if (fetchResult.diagnostics.errorMessage) {
      evidence.diagnostics.errors.gps = fetchResult.diagnostics.errorMessage;
      warnings.push(`gps_fetch_error: ${fetchResult.diagnostics.errorMessage}`);
    }
    if (fetchResult.diagnostics.warning) {
      warnings.push(fetchResult.diagnostics.warning);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    evidence.diagnostics.errors.gps = msg;
    warnings.push(`gps_fetch_exception: ${msg}`);
  }

  // ── Lager 1.3 + 1.4 + 1.7: normalisering, outlier-detektering, sammanställning
  // Endast tekniskt ogiltiga pings hard-rejectas. Outliers markeras
  // ignoredForLocationLogic men finns kvar i raw evidence + diagnostics.
  // buildGpsDayTimeline / buildLocationTruthTimeline rörs INTE.
  let normalizedPings: NormalizedGpsPing[] = [];
  let locationLogicPings: NormalizedGpsPing[] = [];
  let hardRejectedPings: HardRejectedGpsPing[] = [];
  let normDiagnostics: GpsNormalizationDiagnostics | null = null;
  let outlierIgnoredCount = 0;
  try {
    const norm = normalizeGpsEvidence(rawPingRows);
    normDiagnostics = norm.diagnostics;
    evidence.diagnostics.gpsNormalizationDiagnostics = norm.diagnostics;
    normalizedPings = norm.normalizedPings;
    hardRejectedPings = norm.hardRejectedPings;
    if (norm.diagnostics.retainedLowAccuracyCount > 0) {
      warnings.push(`gps_low_accuracy_retained:${norm.diagnostics.retainedLowAccuracyCount}`);
    }
    if (norm.diagnostics.hardRejectedPingCount > 0) {
      warnings.push(`gps_hard_rejected:${norm.diagnostics.hardRejectedPingCount}`);
    }

    try {
      const outlier = detectGpsOutliers(normalizedPings);
      evidence.diagnostics.gpsOutlierDiagnostics = outlier.diagnostics;
      normalizedPings = outlier.pings; // mutated in place w/ ignoredForLocationLogic flips
      outlierIgnoredCount = outlier.diagnostics.outlierIgnoredCount;
      if (outlier.diagnostics.outlierIgnoredCount > 0) {
        warnings.push(`gps_outliers_ignored_for_location:${outlier.diagnostics.outlierIgnoredCount}`);
      }
      if (outlier.diagnostics.retainedFarClusterCount > 0) {
        warnings.push(`gps_far_clusters_retained:${outlier.diagnostics.retainedFarClusterCount}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`gps_outlier_exception: ${msg}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`gps_normalize_exception: ${msg}`);
  }

  // ── Bygg locationLogicPings + summaries (Lager 1.7) ─────────────────────
  locationLogicPings = normalizedPings.filter(
    (p) => !p.hardRejected && !p.ignoredForLocationLogic,
  );

  evidence.gps.normalizedPingCount = normalizedPings.length;
  evidence.gps.locationLogicPingCount = locationLogicPings.length;
  evidence.gps.hardRejectedPingCount = hardRejectedPings.length;
  evidence.gps.ignoredOutlierPingCount = outlierIgnoredCount;
  evidence.gps.medianAccuracyMeters = normDiagnostics?.medianAccuracyMeters ?? null;
  evidence.gps.p90AccuracyMeters = normDiagnostics?.p90AccuracyMeters ?? null;

  // Gap analysis (PÅ locationLogicPings, ej raw).
  const sortedLogic = [...locationLogicPings].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );
  let longGapCount = 0;
  let maxGapMs = 0;
  const gapsMs: number[] = [];
  for (let i = 1; i < sortedLogic.length; i++) {
    const gap = Date.parse(sortedLogic[i].ts) - Date.parse(sortedLogic[i - 1].ts);
    if (gap > 0) gapsMs.push(gap);
    if (gap > 15 * 60 * 1000) longGapCount++;
    if (gap > maxGapMs) maxGapMs = gap;
  }
  evidence.gps.longGapCount = longGapCount;
  evidence.gps.maxGapMinutes = sortedLogic.length >= 2 ? +(maxGapMs / 60000).toFixed(2) : null;
  evidence.gps.firstLocationLogicPingAt = sortedLogic[0]?.ts ?? null;
  evidence.gps.lastLocationLogicPingAt = sortedLogic[sortedLogic.length - 1]?.ts ?? null;

  // hasNightActivity: någon locationLogicPing 21:00–06:00 lokal tid.
  evidence.gps.hasNightActivity = sortedLogic.some((p) =>
    isInNightWindow(p.ts, timezone),
  );

  // coverageRatio: andel minuter i dagfönstret med någon locationLogicPing.
  evidence.gps.coverageRatio = computeCoverageRatio(
    sortedLogic,
    dayStartUtc,
    dayEndUtc,
  );

  // Summaries
  evidence.gps.normalizedPingsSummary = {
    count: normalizedPings.length,
    firstAt: normalizedPings.length > 0 ? normalizedPings[0].ts : null,
    lastAt: normalizedPings.length > 0 ? normalizedPings[normalizedPings.length - 1].ts : null,
    qualityCounts: {
      excellent: normDiagnostics?.excellentCount ?? 0,
      good: normDiagnostics?.goodCount ?? 0,
      usable: normDiagnostics?.usableCount ?? 0,
      weak: normDiagnostics?.weakCount ?? 0,
      veryWeak: normDiagnostics?.veryWeakCount ?? 0,
      outlierCandidate: normDiagnostics?.outlierCandidateCount ?? 0,
      unknown: 0,
    },
    retainedLowAccuracyCount: normDiagnostics?.retainedLowAccuracyCount ?? 0,
    ignoredForLocationLogicCount: outlierIgnoredCount,
    hardRejectedCount: hardRejectedPings.length,
  };

  let medianGapSeconds: number | null = null;
  if (gapsMs.length > 0) {
    const sortedGaps = [...gapsMs].sort((a, b) => a - b);
    const mid = Math.floor(sortedGaps.length / 2);
    medianGapSeconds = +(
      (sortedGaps.length % 2 === 0
        ? (sortedGaps[mid - 1] + sortedGaps[mid]) / 2
        : sortedGaps[mid]) / 1000
    ).toFixed(1);
  }

  evidence.gps.locationLogicPingsSummary = {
    count: sortedLogic.length,
    firstAt: evidence.gps.firstLocationLogicPingAt,
    lastAt: evidence.gps.lastLocationLogicPingAt,
    medianGapSeconds,
    maxGapMinutes: evidence.gps.maxGapMinutes,
  };

  // Internt evidence-set (för Lager 2). Får INTE serialiseras blint utåt.
  evidence.internal.normalizedPings = normalizedPings;
  evidence.internal.locationLogicPings = locationLogicPings;
  evidence.internal.hardRejectedPings = hardRejectedPings;

  // Konsoliderad gps-snapshot i diagnostics.gps.
  evidence.diagnostics.gps = {
    rawPingCount: fetchedPingCount,
    fetchedPingCount,
    normalizedPingCount: normalizedPings.length,
    locationLogicPingCount: locationLogicPings.length,
    hardRejectedPingCount: hardRejectedPings.length,
    ignoredOutlierPingCount: outlierIgnoredCount,
    retainedLowAccuracyCount: normDiagnostics?.retainedLowAccuracyCount ?? 0,
    medianAccuracyMeters: normDiagnostics?.medianAccuracyMeters ?? null,
    p90AccuracyMeters: normDiagnostics?.p90AccuracyMeters ?? null,
    longGapCount,
    maxGapMinutes: evidence.gps.maxGapMinutes,
    coverageRatio: evidence.gps.coverageRatio,
    hasNightActivity: evidence.gps.hasNightActivity,
  };

  // ── Lager 1.5: Assignment Evidence (PLANNING IS CONTEXT, NOT PROOF) ─────
  // Samlar booking_staff_assignments, staff_assignments + calendar_events och
  // large_project_team_assignments för staff/dag. Får INTE användas som
  // location truth, display-block eller för transport/okänd plats/granska.
  // Lager 2 konsumerar detta som CONTEXT mot faktiska bevis.
  let assignmentCalendarEventsForKt: any[] = [];
  try {
    const ae = await buildAssignmentEvidence({
      supabaseAdmin: input.supabaseAdmin,
      organizationId: input.organizationId,
      staffId: input.staffId,
      date: input.date,
      dayStartUtc,
      dayEndUtc,
    });
    evidence.assignments.items = ae.items;
    evidence.assignments.assignmentCount = ae.items.length;
    evidence.assignments.bookingIds = Array.from(
      new Set(ae.items.map((i) => i.bookingId).filter((x): x is string => !!x)),
    );
    evidence.assignments.largeProjectIds = Array.from(
      new Set(ae.items.map((i) => i.largeProjectId).filter((x): x is string => !!x)),
    );
    evidence.assignments.hasPlannedDay = ae.items.some((i) => i.overlapsDate);
    evidence.dataQuality.assignmentsAvailable = ae.items.length > 0;
    evidence.diagnostics.counts.assignments = ae.items.length;
    evidence.diagnostics.assignmentEvidenceDiagnostics = ae.diagnostics;
    // Lager 1.9 — bevara rik calendar_event-form för knownTargets-anropet.
    assignmentCalendarEventsForKt = (ae.calendarEvents ?? []).map((ce) => ({
      id: ce.assignmentId,
      eventId: ce.eventId,
      bookingId: ce.bookingId,
      largeProjectId: ce.largeProjectId,
      teamId: ce.teamId,
      title: ce.title,
      plannedPhase: ce.plannedPhase,
    }));
    if (ae.diagnostics.warnings.length > 0) {
      for (const w of ae.diagnostics.warnings) warnings.push(`assignment_evidence:${w}`);
    }
    if (ae.diagnostics.assignmentsWithoutTargetCount > 0) {
      warnings.push(
        `assignment_without_target:${ae.diagnostics.assignmentsWithoutTargetCount}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    evidence.diagnostics.errors.assignments = msg;
    warnings.push(`assignment_evidence_exception: ${msg}`);
  }

  // ── Lager 1.6: Known Targets + Data Quality ─────────────────────────────
  // Samlar warehouse, organization_locations, large_projects, projects,
  // bookings, private/home zones för dagen. KNOWN TARGETS ÄR INTE BEVIS PÅ
  // NÄRVARO. Får INTE användas som location truth, display-block eller
  // payroll. Lager 2+ konsumerar detta som CONTEXT mot faktiska bevis.
  // Stora projekt = primary work + geo target (om egen geo). Child bookings
  // inom large project undertrycks som primary/geo target.
  try {
    const kt = await buildKnownTargetsEvidence({
      supabaseAdmin: input.supabaseAdmin,
      organizationId: input.organizationId,
      staffId: input.staffId,
      date: input.date,
      assignmentBookingIds: evidence.assignments.bookingIds,
      assignmentLargeProjectIds: evidence.assignments.largeProjectIds,
      assignmentItems: (evidence.assignments.items ?? []).map((i) => ({
        assignmentId: i.assignmentId,
        bookingId: i.bookingId,
        largeProjectId: i.largeProjectId,
      })),
      // Lager 1.9 — rik calendar_event-data så knownTargets kan diagnosticera
      // calendarEventsWithoutTarget / withLargeProjectContext / pointingToChildBooking /
      // pointingToMissingGeoLargeProject. Planering är fortfarande context, inte proof.
      assignmentCalendarEvents: (ae?.calendarEvents ?? []).map((ce) => ({
        id: ce.assignmentId,
        eventId: ce.eventId,
        bookingId: ce.bookingId,
        largeProjectId: ce.largeProjectId,
        teamId: ce.teamId,
        title: ce.title,
        plannedPhase: ce.plannedPhase,
      })),
    });
    evidence.knownTargets.items = kt.items;
    evidence.knownTargets.dataQuality = kt.dataQuality;
    evidence.knownTargets.totalCount = kt.items.length;
    evidence.knownTargets.withCoordinatesCount = kt.items.filter(
      (i) => i.hasCoordinates || i.polygon !== null,
    ).length;
    evidence.knownTargets.invalidCount = kt.items.filter((i) => i.suppressedReason !== null).length;
    evidence.diagnostics.counts.knownTargets = kt.items.length;
    evidence.diagnostics.counts.privateZones = kt.diagnostics.privateZoneCount;
    evidence.diagnostics.counts.largeProjects = kt.diagnostics.largeProjectCount;
    evidence.diagnostics.knownTargetsDiagnostics = kt.diagnostics;
    evidence.dataQuality.knownTargetsAvailable = kt.items.length > 0;
    evidence.dataQuality.privateResidenceAvailable = kt.diagnostics.privateZoneCount > 0;
    evidence.dataQuality.largeProjectAvailable = kt.diagnostics.largeProjectCount > 0;

    // Spegla privateResidence + largeProjects-summary mot bakåtkompatibla fält.
    evidence.privateResidence.zoneCount = kt.diagnostics.privateZoneCount;
    evidence.privateResidence.hasUsableZone = kt.items.some(
      (i) => i.targetType === 'private_zone' && i.canBeGeoTarget,
    );
    evidence.largeProjects.count = kt.diagnostics.largeProjectCount;
    evidence.largeProjects.withOwnGeoCount = kt.items.filter(
      (i) => i.targetType === 'large_project' && i.canBeGeoTarget,
    ).length;

    if (kt.diagnostics.warnings.length > 0) {
      for (const w of kt.diagnostics.warnings) warnings.push(`known_targets:${w}`);
    }
    if (kt.diagnostics.largeProjectsMissingGeoCount > 0) {
      warnings.push(`large_projects_missing_geo:${kt.diagnostics.largeProjectsMissingGeoCount}`);
    }
    if (kt.diagnostics.childBookingsSuppressedCount > 0) {
      warnings.push(`child_bookings_suppressed:${kt.diagnostics.childBookingsSuppressedCount}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    evidence.diagnostics.errors.knownTargets = msg;
    warnings.push(`known_targets_exception: ${msg}`);
  }

  evidence.diagnostics.buildDurationMs = Date.now() - startedAt;
  return evidence;
}
