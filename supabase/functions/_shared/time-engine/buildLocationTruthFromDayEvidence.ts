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
import {
  buildStableLocationClusters,
  type StableClusterDiagnostics,
  type StableLocationCluster,
} from './buildStableLocationClusters.ts';
import {
  matchClusterToKnownTarget,
  type MatchClusterResult,
  type MatchedTargetType,
} from './matchClusterToKnownTarget.ts';

// ── Lager 2.3 — Target match diagnostics ───────────────────────────────────

export interface TargetMatchDiagnostics {
  clustersEvaluated: number;
  matchedKnownSiteCount: number;
  matchedPrivateCount: number;
  matchedWarehouseCount: number;
  matchedLargeProjectCount: number;
  matchedProjectCount: number;
  matchedBookingCount: number;
  matchedOrganizationLocationCount: number;
  unknownClusterCount: number;
  needsLocationReviewCount: number;
  planningUsedAsTieBreakerCount: number;
  planningIgnoredBecauseGeoDisagreedCount: number;
  examples: Array<{
    clusterId: string;
    matchedType: MatchedTargetType;
    targetId: string | null;
    label: string;
    confidence: 'high' | 'medium' | 'low';
    decisionReason: string;
    candidateCount: number;
    rejectedCount: number;
    warnings: string[];
  }>;
}

export interface ClusterMatchEntry {
  clusterId: string;
  match: MatchClusterResult;
}

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
  /** Lager 2.2: stabila platskluster (diagnostics-only än så länge). */
  stableClusterDiagnostics: StableClusterDiagnostics | null;
  /** Lager 2.3: target-match per kluster. */
  targetMatchDiagnostics: TargetMatchDiagnostics | null;
}

export interface LocationTruthResult {
  segments: LocationTruthSegment[];
  diagnostics: LocationTruthDiagnostics;
  /**
   * Lager 2.2: rå klusterlista exponeras för debug/Lager 2.3-konsumtion.
   * Skrivs INTE till någon downstream-tabell ännu.
   */
  stableClusters: StableLocationCluster[];
  /** Lager 2.3: matchningsresultat per kluster (debug/diagnostics-only). */
  clusterMatches: ClusterMatchEntry[];
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

  // Lager 2.2: bygg stabila platskluster (diagnostics-only).
  let stableClusters: StableLocationCluster[] = [];
  let stableClusterDiagnostics: StableClusterDiagnostics | null = null;
  try {
    const result = buildStableLocationClusters(logicPings);
    stableClusters = result.clusters;
    stableClusterDiagnostics = result.diagnostics;
  } catch (err) {
    warnings.push(
      `location_truth_stable_clusters_failed:${(err as Error).message}`,
    );
  }

  if (!Array.isArray(logicPings) || logicPings.length === 0) {
    skippedReason = 'no_pings';
    warnings.push('location_truth_no_location_logic_pings');
  } else if (counts.knownTargetsWithCoordinates === 0 && counts.privateZones === 0) {
    hasUsableEvidence = true;
    skippedReason = 'no_evidence';
    warnings.push('location_truth_no_target_geometry_to_match');
  } else {
    hasUsableEvidence = true;
    skippedReason = 'not_implemented_yet';
    warnings.push('location_truth_builder_scaffold_no_segments_emitted');
  }

  // Lager 2.3: matcha varje stabilt kluster mot known targets.
  const clusterMatches: ClusterMatchEntry[] = [];
  let targetMatchDiagnostics: TargetMatchDiagnostics | null = null;
  try {
    const knownTargets = dayEvidence.knownTargets?.items ?? [];
    const assignments = dayEvidence.assignments?.items ?? [];
    const privateResidence = {
      hasUsableZone: dayEvidence.privateResidence?.hasUsableZone ?? false,
    };

    const diag: TargetMatchDiagnostics = {
      clustersEvaluated: 0,
      matchedKnownSiteCount: 0,
      matchedPrivateCount: 0,
      matchedWarehouseCount: 0,
      matchedLargeProjectCount: 0,
      matchedProjectCount: 0,
      matchedBookingCount: 0,
      matchedOrganizationLocationCount: 0,
      unknownClusterCount: 0,
      needsLocationReviewCount: 0,
      planningUsedAsTieBreakerCount: 0,
      planningIgnoredBecauseGeoDisagreedCount: 0,
      examples: [],
    };

    for (const cluster of stableClusters) {
      const match = matchClusterToKnownTarget({
        cluster,
        knownTargets,
        assignments,
        privateResidence,
        dataQuality: dayEvidence.knownTargets?.dataQuality,
      });
      clusterMatches.push({ clusterId: cluster.id, match });

      diag.clustersEvaluated++;
      switch (match.matchedTarget.type) {
        case 'private_residence':
          diag.matchedPrivateCount++;
          diag.matchedKnownSiteCount++;
          break;
        case 'warehouse':
          diag.matchedWarehouseCount++;
          diag.matchedKnownSiteCount++;
          break;
        case 'organization_location':
          diag.matchedOrganizationLocationCount++;
          diag.matchedKnownSiteCount++;
          break;
        case 'large_project':
          diag.matchedLargeProjectCount++;
          diag.matchedKnownSiteCount++;
          break;
        case 'project':
          diag.matchedProjectCount++;
          diag.matchedKnownSiteCount++;
          break;
        case 'booking':
          diag.matchedBookingCount++;
          diag.matchedKnownSiteCount++;
          break;
        case 'unknown_area':
          diag.unknownClusterCount++;
          break;
        case 'needs_location_review':
          diag.needsLocationReviewCount++;
          break;
      }
      if (match.planningUsedAsTieBreaker) diag.planningUsedAsTieBreakerCount++;
      if (match.planningIgnoredBecauseGeoDisagreed) {
        diag.planningIgnoredBecauseGeoDisagreedCount++;
      }
      if (diag.examples.length < 5) {
        diag.examples.push({
          clusterId: cluster.id,
          matchedType: match.matchedTarget.type,
          targetId: match.matchedTarget.targetId,
          label: match.matchedTarget.label,
          confidence: match.confidence,
          decisionReason: match.decisionReason,
          candidateCount: match.candidates.length,
          rejectedCount: match.rejectedCandidates.length,
          warnings: match.warnings,
        });
      }
    }
    targetMatchDiagnostics = diag;
  } catch (err) {
    warnings.push(
      `location_truth_target_match_failed:${(err as Error).message}`,
    );
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
    stableClusterDiagnostics,
    targetMatchDiagnostics,
  };

  return { segments: [], diagnostics, stableClusters, clusterMatches };
}
