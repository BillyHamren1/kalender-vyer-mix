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
  /** Raw count of staff_assignments rows for this staff+date. */
  assignmentCount: number;
  /** Distinct booking ids referenced by assignments. */
  bookingIds: string[];
  /** Distinct large_project ids referenced by assignments (if any). */
  largeProjectIds: string[];
  /** True if planning marks this as a planned working day. */
  hasPlannedDay: boolean;
}

export interface DayKnownTargetsEvidence {
  /** organization_locations + project + booking targets resolved for the day. */
  totalCount: number;
  withCoordinatesCount: number;
  /** Targets explicitly invalid (missing_coordinates, test_data, cancelled…). */
  invalidCount: number;
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
    },
  };

  warnings.push('day_evidence_scaffold_v1: no signals collected yet');
  evidence.diagnostics.buildDurationMs = Date.now() - startedAt;
  return evidence;
}
