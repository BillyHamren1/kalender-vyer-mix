/**
 * Location Truth Layer (Time Engine — Lager 2.1, scaffold)
 *
 * Konsumerar DayEvidence (Lager 1) och bygger en ren plats-tidslinje.
 * Detta lager svarar ENDAST på frågan: "Var var personen?".
 *
 * Lager 2 ska INTE:
 *   - bestämma RIGG / ARBETE / EVENT / RIGDOWN som fas
 *   - skapa time_reports
 *   - skapa location_time_entries
 *   - ändra active_time_registrations
 *   - ändra GPS-pings
 *   - ändra payroll / approval
 *   - skriva display_blocks_json
 *   - bygga Gantt UI-block
 *   - använda planering som proof of location
 *
 * Lager 2 MÅSTE:
 *   - läsa DayEvidence.internal.locationLogicPings (sanningskälla)
 *   - använda evidence.knownTargets / privateResidence / largeProjects som CONTEXT
 *   - aldrig falla tillbaka på child booking-geo för large project
 *   - aldrig konsumera assignments som proof of location
 *
 * v1 (denna fil): scaffold + interfaces + tom segments-array.
 *   - Returnerar diagnostics med counts.
 *   - Kopplas read-only i get-staff-presence-day.
 *   - Påverkar INTE buildLocationTruthTimeline / buildGpsDayTimeline /
 *     interpretDayTimeline / Time Engine block-bygge.
 */

import type { DayEvidence } from './buildDayEvidence.ts';

// ── Output shape ──────────────────────────────────────────────────────────

export type LocationTruthSegmentType =
  | 'known_site'
  | 'movement'
  | 'private_residence'
  | 'unknown_area'
  | 'needs_location_review';

export type LocationTruthTargetType =
  | 'warehouse'
  | 'organization_location'
  | 'large_project'
  | 'project'
  | 'booking'
  | 'private_zone';

export interface LocationTruthMatchedTarget {
  targetType: LocationTruthTargetType;
  targetId: string;
  label: string;
}

export interface LocationTruthSegmentEvidence {
  pingCount: number;
  centroidLat?: number;
  centroidLng?: number;
  medianAccuracyMeters?: number;
  distanceToTargetMeters?: number;
  insideRadius?: boolean;
  /** True om en assignment matchar samma target (CONTEXT, INTE proof). */
  assignmentSupportsTarget?: boolean;
}

export interface LocationTruthSegmentDiagnostics {
  sourcePingIds?: string[];
  bridgedSignalGapMinutes?: number;
  ignoredOutlierPingCount?: number;
  competingTargets?: unknown[];
  rejectedReasons?: string[];
  decisionReason?: string;
}

export interface LocationTruthSegment {
  id: string;
  staffId: string;
  startAt: string;
  endAt: string;
  type: LocationTruthSegmentType;
  matchedTarget?: LocationTruthMatchedTarget;
  confidence: 'high' | 'medium' | 'low';
  evidence: LocationTruthSegmentEvidence;
  warnings: string[];
  diagnostics: LocationTruthSegmentDiagnostics;
}

export interface LocationTruthDiagnostics {
  staffId: string;
  date: string;
  builtAtIso: string;
  buildDurationMs: number;
  /** True när vi hade tillräckligt med locationLogicPings för att bygga segments. */
  hasUsableEvidence: boolean;
  /** Snabb counts-snapshot för log scanning. */
  counts: {
    locationLogicPings: number;
    knownTargets: number;
    knownTargetsWithCoordinates: number;
    largeProjects: number;
    privateZones: number;
    assignments: number;
    segments: number;
    segmentsByType: Record<LocationTruthSegmentType, number>;
  };
  warnings: string[];
  /** Anledningar till att lagret inte kunde bygga segments (om någon). */
  skippedReason: 'no_pings' | 'no_evidence' | 'not_implemented_yet' | null;
}

export interface LocationTruthResult {
  segments: LocationTruthSegment[];
  diagnostics: LocationTruthDiagnostics;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function emptyCounts(
  dayEvidence: DayEvidence,
): LocationTruthDiagnostics['counts'] {
  return {
    locationLogicPings: dayEvidence.gps?.locationLogicPingCount ?? 0,
    knownTargets: dayEvidence.knownTargets?.totalCount ?? 0,
    knownTargetsWithCoordinates: dayEvidence.knownTargets?.withCoordinatesCount ?? 0,
    largeProjects: dayEvidence.largeProjects?.count ?? 0,
    privateZones: dayEvidence.privateResidence?.zoneCount ?? 0,
    assignments: dayEvidence.assignments?.assignmentCount ?? 0,
    segments: 0,
    segmentsByType: {
      known_site: 0,
      movement: 0,
      private_residence: 0,
      unknown_area: 0,
      needs_location_review: 0,
    },
  };
}

// ── Builder ───────────────────────────────────────────────────────────────

/**
 * v1: scaffold. Bygger inga segments än.
 *
 * Returnerar tom segments-array + diagnostics. Konsumenter ska behandla
 * outputen som diagnostics-only tills senare faser kopplar in segment-bygget.
 */
export function buildLocationTruthFromDayEvidence(
  dayEvidence: DayEvidence,
): LocationTruthResult {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const counts = emptyCounts(dayEvidence);

  let skippedReason: LocationTruthDiagnostics['skippedReason'] = 'not_implemented_yet';
  let hasUsableEvidence = false;

  const logicPings = dayEvidence.internal?.locationLogicPings ?? [];
  if (!Array.isArray(logicPings) || logicPings.length === 0) {
    skippedReason = 'no_pings';
    warnings.push('location_truth_no_location_logic_pings');
  } else if (counts.knownTargetsWithCoordinates === 0 && counts.privateZones === 0) {
    // Vi har pings men inget att matcha mot — segmenten skulle ändå bli
    // unknown_area i nästa fas. Markera tydligt.
    hasUsableEvidence = true;
    skippedReason = 'no_evidence';
    warnings.push('location_truth_no_target_geometry_to_match');
  } else {
    hasUsableEvidence = true;
    // v1: builder är scaffold — vi bygger inte segments här.
    skippedReason = 'not_implemented_yet';
    warnings.push('location_truth_builder_scaffold_no_segments_emitted');
  }

  const diagnostics: LocationTruthDiagnostics = {
    staffId: dayEvidence.staffId,
    date: dayEvidence.date,
    builtAtIso: new Date().toISOString(),
    buildDurationMs: Date.now() - startedAt,
    hasUsableEvidence,
    counts,
    warnings,
    skippedReason,
  };

  return { segments: [], diagnostics };
}
