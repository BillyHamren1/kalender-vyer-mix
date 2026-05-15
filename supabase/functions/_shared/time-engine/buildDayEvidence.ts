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

export interface DayGpsEvidence {
  pingCount: number;
  firstPingAt: string | null;
  lastPingAt: string | null;
  /** Coarse coverage 0..1 of the day window where pings exist. */
  coverageRatio: number;
  /** Gaps > 15 min between consecutive pings (count only — no segments). */
  longGapCount: number;
  /** Median accuracy in meters when reported (null if unknown). */
  medianAccuracyMeters: number | null;
  /** True if night window 00:00–05:00 has any pings. */
  hasNightActivity: boolean;
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
  /** Diagnostics from the canonical paginated GPS reader (Lager 1.2). */
  gpsFetchDiagnostics: FetchAllStaffLocationPingsDiagnostics | null;
  /** Quality breakdown from GPS normalisation (Lager 1.3). */
  gpsNormalizationDiagnostics: GpsNormalizationDiagnostics | null;
  /** Outlier-detektering för location logic (Lager 1.4). */
  gpsOutlierDiagnostics: GpsOutlierDiagnostics | null;
  /** Assignment-evidence (Lager 1.5). PLANNING IS CONTEXT, NOT PROOF OF LOCATION. */
  assignmentEvidenceDiagnostics: AssignmentEvidenceDiagnostics | null;
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
}

// ── Safe defaults ──────────────────────────────────────────────────────────

const emptyGps = (): DayGpsEvidence => ({
  pingCount: 0,
  firstPingAt: null,
  lastPingAt: null,
  coverageRatio: 0,
  longGapCount: 0,
  medianAccuracyMeters: null,
  hasNightActivity: false,
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
    },
  };

  // ── Lager 1.2: GPS via canonical paginated reader ────────────────────────
  const dayStartUtc = input.dayStartUtc ?? `${input.date}T00:00:00.000Z`;
  const dayEndUtc = input.dayEndUtc ?? `${input.date}T23:59:59.999Z`;
  let rawPingRows: any[] = [];
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
    evidence.gps.pingCount = fetchResult.diagnostics.totalFetched;
    evidence.gps.firstPingAt = fetchResult.diagnostics.firstRecordedAt;
    evidence.gps.lastPingAt = fetchResult.diagnostics.lastRecordedAt;
    evidence.dataQuality.gpsAvailable = fetchResult.diagnostics.totalFetched > 0;
    evidence.diagnostics.counts.pings = fetchResult.diagnostics.totalFetched;
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

  // ── Lager 1.3: GPS-normalisering (read-only, ej downstream-konsumerad) ──
  // Endast tekniskt ogiltiga pings hard-rejectas. Låg accuracy behålls med
  // confidenceWeight så Lager 2 kan välja viktning. buildGpsDayTimeline rörs
  // INTE i denna prompt.
  try {
    const norm = normalizeGpsEvidence(rawPingRows);
    evidence.diagnostics.gpsNormalizationDiagnostics = norm.diagnostics;
    if (norm.diagnostics.retainedLowAccuracyCount > 0) {
      warnings.push(
        `gps_low_accuracy_retained:${norm.diagnostics.retainedLowAccuracyCount}`,
      );
    }
    if (norm.diagnostics.hardRejectedPingCount > 0) {
      warnings.push(
        `gps_hard_rejected:${norm.diagnostics.hardRejectedPingCount}`,
      );
    }

    // ── Lager 1.4: Outlier-detektering (read-only) ───────────────────────
    // Markerar ignoredForLocationLogic på enstaka spikar. Skapar varken
    // transport, okänd plats eller granska. Raw evidence röra ej; vi
    // ignorerar bara för location logic. buildGpsDayTimeline rörs INTE.
    try {
      const outlier = detectGpsOutliers(norm.normalizedPings);
      evidence.diagnostics.gpsOutlierDiagnostics = outlier.diagnostics;
      if (outlier.diagnostics.outlierIgnoredCount > 0) {
        warnings.push(
          `gps_outliers_ignored_for_location:${outlier.diagnostics.outlierIgnoredCount}`,
        );
      }
      if (outlier.diagnostics.retainedFarClusterCount > 0) {
        warnings.push(
          `gps_far_clusters_retained:${outlier.diagnostics.retainedFarClusterCount}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`gps_outlier_exception: ${msg}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`gps_normalize_exception: ${msg}`);
  }

  // ── Lager 1.5: Assignment Evidence (PLANNING IS CONTEXT, NOT PROOF) ─────
  // Samlar booking_staff_assignments, staff_assignments + calendar_events och
  // large_project_team_assignments för staff/dag. Får INTE användas som
  // location truth, display-block eller för transport/okänd plats/granska.
  // Lager 2 konsumerar detta som CONTEXT mot faktiska bevis.
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

  warnings.push('day_evidence_scaffold_v1: signals beyond gps+assignments not collected yet');
  evidence.diagnostics.buildDurationMs = Date.now() - startedAt;
  return evidence;
}
