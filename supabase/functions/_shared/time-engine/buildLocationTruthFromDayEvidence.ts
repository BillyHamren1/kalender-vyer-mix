/**
 * Location Truth Layer (Time Engine — Lager 2.3b)
 *
 * Konsumerar DayEvidence (Lager 1) och bygger en ren plats-tidslinje där
 * FYSISK PLATS och EVENTFLOW BUSINESS TARGET hålls åtskilda.
 *
 * Produktregel (Lager 2.3b):
 *   En plats är inte "okänd" bara för att den inte matchar en
 *   booking/projekt/lager. Stabil GPS-centroid = känd fysisk plats.
 *   Saknas EventFlow-target ⇒ businessContext = unresolved_business_context,
 *   inte segment-type = unknown_area.
 *
 * Lager 2 ska INTE: skapa time_reports / location_time_entries / payroll /
 * display_blocks / Gantt-block / använda planering som proof of location.
 *
 * Lager 2 MÅSTE: läsa DayEvidence.internal.locationLogicPings, behandla
 * private/warehouse/large_project/project/booking-targets korrekt och
 * aldrig falla tillbaka på child booking-geo för large project.
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
import {
  resolvePhysicalLocationForCluster,
  type PhysicalLocation,
} from './resolvePhysicalLocationForCluster.ts';
import {
  bridgeSignalGaps,
  type GapBridgeDiagnostics,
} from './bridgeSignalGaps.ts';
import {
  detectTrueMovement,
  type MovementDiagnostics,
} from './detectTrueMovement.ts';

// ── Lager 2.3 — Target match diagnostics ───────────────────────────────────

export interface TargetMatchDiagnostics {
  clustersEvaluated: number;
  matchedKnownSiteCount: number;
  matchedPrivateCount: number;
  matchedWarehouseCount: number;
  matchedSupplierCount: number;
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

// ── Lager 2.3c — Supplier match diagnostics ───────────────────────────────

export interface SupplierMatchDiagnostics {
  supplierTargetsEvaluated: number;
  supplierMatchedClusterCount: number;
  supplierPlanningMismatchCount: number;
  competingSupplierTargetCount: number;
  examples: Array<{
    clusterId: string;
    supplierTargetId: string | null;
    supplierLabel: string;
    confidence: 'high' | 'medium' | 'low';
    distanceMeters?: number;
    competingCandidateCount: number;
    warnings: string[];
  }>;
}

export interface ClusterMatchEntry {
  clusterId: string;
  match: MatchClusterResult;
}

// ── Lager 2.3b — Physical location vs business context ────────────────────

export interface PhysicalLocationDiagnostics {
  clustersWithKnownTargetCount: number;
  clustersWithKnownAddressNoTargetCount: number;
  unresolvedLocationCount: number;
  reverseGeocodeUsedCount: number;
  centroidOnlyAddressCount: number;
  noEventFlowTargetMatchCount: number;
  planningGeoMismatchCount: number;
  examples: Array<{
    clusterId: string;
    segmentType: LocationTruthSegmentType;
    physicalLocationSource: PhysicalLocation['source'];
    businessContextStatus: BusinessContextStatus;
    matchedTargetType?: LocationTruthTargetType;
    label?: string;
    warnings: string[];
  }>;
}

// ── Output shape ──────────────────────────────────────────────────────────

export type LocationTruthSegmentType =
  | 'known_target'
  | 'known_address'
  | 'private_residence'
  | 'movement'
  | 'unresolved_location'
  | 'needs_location_review';

/**
 * Lager 2.6 — kanonisk Final Location Truth-typ.
 * Detta är det rena platsalfabetet som senare lager (interpretering,
 * tidrapportering, payroll) får läsa. Vi mappar de interna typerna
 * (known_target, known_address, unresolved_location) till denna lista.
 *
 * Final-listan innehåller medvetet INTE: rig/work/event/rigdown/payroll/
 * display_blocks. Det är en plats-tidslinje, inte en arbetspass-tolkning.
 */
export type FinalLocationTruthSegmentType =
  | 'known_site'
  | 'movement'
  | 'private_residence'
  | 'unknown_area'
  | 'needs_location_review';

export type LocationTruthTargetType =
  | 'warehouse'
  | 'organization_location'
  | 'supplier'
  | 'large_project'
  | 'project'
  | 'booking'
  | 'private_zone';

export type BusinessContextStatus =
  | 'matched_eventflow_target'
  | 'unresolved_business_context'
  | 'planning_geo_mismatch'
  | 'no_target_match'
  | 'needs_review';

export interface LocationTruthMatchedTarget {
  targetType: LocationTruthTargetType;
  targetId: string;
  label: string;
  address?: string;
}

export interface LocationTruthBusinessContext {
  status: BusinessContextStatus;
  matchedTarget?: LocationTruthMatchedTarget;
  warnings?: string[];
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
  /** Internal pipeline-typ (Lager 2.3b–2.5). */
  type: LocationTruthSegmentType;
  /** Lager 2.6 — kanonisk plats-typ för konsumenter (Lager 3+). */
  finalType: FinalLocationTruthSegmentType;
  /** Bakåtkompatibel snabbreferens. Spegel av businessContext.matchedTarget. */
  matchedTarget?: LocationTruthMatchedTarget;
  /** Lager 2.3b — fysisk plats (oberoende av EventFlow business target). */
  physicalLocation?: PhysicalLocation;
  /** Lager 2.3b — business-context-tolkning ovanpå fysisk plats. */
  businessContext?: LocationTruthBusinessContext;
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
  hasUsableEvidence: boolean;
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
  skippedReason: 'no_pings' | 'no_evidence' | 'not_implemented_yet' | null;
  stableClusterDiagnostics: StableClusterDiagnostics | null;
  targetMatchDiagnostics: TargetMatchDiagnostics | null;
  /** Lager 2.3b — diagnostics för fysisk-plats vs business-context-uppdelning. */
  physicalLocationDiagnostics: PhysicalLocationDiagnostics | null;
  /** Lager 2.3c — supplier-match diagnostics. */
  supplierMatchDiagnostics: SupplierMatchDiagnostics | null;
  /** Lager 2.4 — gap-bridge diagnostics. */
  gapBridgeDiagnostics: GapBridgeDiagnostics | null;
  /** Lager 2.5 — verklig förflyttning (movement). */
  movementDiagnostics: MovementDiagnostics | null;
  /** Lager 2.6 — sammanfattning över final platstidslinje. */
  locationTruthSummary: LocationTruthSummary | null;
}

export interface LocationTruthSummary {
  inputPingCount: number;
  clusterCount: number;
  finalSegmentCount: number;
  knownSiteSegmentCount: number;
  movementSegmentCount: number;
  privateResidenceSegmentCount: number;
  unknownAreaSegmentCount: number;
  reviewSegmentCount: number;
  bridgedGapMinutesTotal: number;
  ignoredOutlierPingCount: number;
  finalSegmentsByType: Record<FinalLocationTruthSegmentType, number>;
  examples: Array<{
    segmentId: string;
    finalType: FinalLocationTruthSegmentType;
    confidence: 'high' | 'medium' | 'low';
    label?: string;
    targetType?: LocationTruthTargetType;
    startAt: string;
    endAt: string;
    warnings: string[];
  }>;
}

export interface LocationTruthResult {
  segments: LocationTruthSegment[];
  diagnostics: LocationTruthDiagnostics;
  stableClusters: StableLocationCluster[];
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
      known_target: 0,
      known_address: 0,
      private_residence: 0,
      movement: 0,
      unresolved_location: 0,
      needs_location_review: 0,
    },
  };
}

function mapMatchTypeToTargetType(
  m: MatchedTargetType,
): LocationTruthTargetType | null {
  switch (m) {
    case 'warehouse':
    case 'organization_location':
    case 'supplier':
    case 'large_project':
    case 'project':
    case 'booking':
      return m;
    case 'private_residence':
      return 'private_zone';
    default:
      return null;
  }
}

function isMatchedToTarget(m: MatchedTargetType): boolean {
  return (
    m === 'warehouse' ||
    m === 'organization_location' ||
    m === 'supplier' ||
    m === 'large_project' ||
    m === 'project' ||
    m === 'booking' ||
    m === 'private_residence'
  );
}

// ── Lager 2.6 — mappa intern typ till kanonisk Final-typ ──────────────────

const STRONG_REVIEW_WARNINGS = new Set([
  'large_project_missing_geo_or_planning_conflict',
  'impossible_route',
  'home_project_conflict',
  'competing_targets_no_winner',
]);

function mapToFinalType(
  seg: LocationTruthSegment,
): FinalLocationTruthSegmentType {
  switch (seg.type) {
    case 'known_target':
      return 'known_site';
    case 'private_residence':
      return 'private_residence';
    case 'movement':
      return 'movement';
    case 'needs_location_review':
      return 'needs_location_review';
    case 'known_address':
    case 'unresolved_location': {
      const hasStrongReview = (seg.warnings ?? []).some((w) =>
        STRONG_REVIEW_WARNINGS.has(w),
      );
      if (hasStrongReview) return 'needs_location_review';
      return 'unknown_area';
    }
    default:
      return 'unknown_area';
  }
}

function targetLabelOf(seg: LocationTruthSegment): string | undefined {
  if (seg.matchedTarget?.label) return seg.matchedTarget.label;
  return seg.physicalLocation?.label;
}

// ── Builder ───────────────────────────────────────────────────────────────

export function buildLocationTruthFromDayEvidence(
  dayEvidence: DayEvidence,
): LocationTruthResult {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const counts = emptyCounts(dayEvidence);
  const segments: LocationTruthSegment[] = [];

  let skippedReason: LocationTruthDiagnostics['skippedReason'] = 'not_implemented_yet';
  let hasUsableEvidence = false;

  const logicPings = dayEvidence.internal?.locationLogicPings ?? [];

  // Lager 2.2: bygg stabila platskluster.
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
  } else {
    hasUsableEvidence = true;
    skippedReason = null;
  }

  const knownTargets = dayEvidence.knownTargets?.items ?? [];
  const assignments = dayEvidence.assignments?.items ?? [];
  const privateResidence = {
    hasUsableZone: dayEvidence.privateResidence?.hasUsableZone ?? false,
  };

  // Lager 2.3: matcha kluster mot known targets.
  const clusterMatches: ClusterMatchEntry[] = [];
  const targetDiag: TargetMatchDiagnostics = {
    clustersEvaluated: 0,
    matchedKnownSiteCount: 0,
    matchedPrivateCount: 0,
    matchedWarehouseCount: 0,
    matchedSupplierCount: 0,
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

  // Lager 2.3b — fysisk-plats-diagnostics.
  const physDiag: PhysicalLocationDiagnostics = {
    clustersWithKnownTargetCount: 0,
    clustersWithKnownAddressNoTargetCount: 0,
    unresolvedLocationCount: 0,
    reverseGeocodeUsedCount: 0,
    centroidOnlyAddressCount: 0,
    noEventFlowTargetMatchCount: 0,
    planningGeoMismatchCount: 0,
    examples: [],
  };

  // Lager 2.3c — supplier-diagnostics.
  const supplierTargetsEvaluated = knownTargets.filter(
    (t) => t.targetType === 'supplier',
  ).length;
  const supplierDiag: SupplierMatchDiagnostics = {
    supplierTargetsEvaluated,
    supplierMatchedClusterCount: 0,
    supplierPlanningMismatchCount: 0,
    competingSupplierTargetCount: 0,
    examples: [],
  };

  try {
    for (const cluster of stableClusters) {
      const match = matchClusterToKnownTarget({
        cluster,
        knownTargets,
        assignments,
        privateResidence,
        dataQuality: dayEvidence.knownTargets?.dataQuality,
      });
      clusterMatches.push({ clusterId: cluster.id, match });

      // Räkna match-utfall.
      targetDiag.clustersEvaluated++;
      switch (match.matchedTarget.type) {
        case 'private_residence':
          targetDiag.matchedPrivateCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'warehouse':
          targetDiag.matchedWarehouseCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'organization_location':
          targetDiag.matchedOrganizationLocationCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'supplier':
          targetDiag.matchedSupplierCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'large_project':
          targetDiag.matchedLargeProjectCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'project':
          targetDiag.matchedProjectCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'booking':
          targetDiag.matchedBookingCount++;
          targetDiag.matchedKnownSiteCount++;
          break;
        case 'unknown_area':
          targetDiag.unknownClusterCount++;
          break;
        case 'needs_location_review':
          targetDiag.needsLocationReviewCount++;
          break;
      }
      if (match.planningUsedAsTieBreaker) targetDiag.planningUsedAsTieBreakerCount++;
      if (match.planningIgnoredBecauseGeoDisagreed) {
        targetDiag.planningIgnoredBecauseGeoDisagreedCount++;
        physDiag.planningGeoMismatchCount++;
      }
      if (targetDiag.examples.length < 5) {
        targetDiag.examples.push({
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

      // ── Lager 2.3b — bygg fysisk plats + business context per kluster ──
      const phys = resolvePhysicalLocationForCluster({
        cluster,
        match,
        knownTargets,
      });
      if (phys.reverseGeocodeUsed) physDiag.reverseGeocodeUsedCount++;

      const segWarnings: string[] = [...phys.warnings];
      const businessWarnings: string[] = [];

      // Bestäm segmenttyp (Lager 2.3b-regler).
      let segmentType: LocationTruthSegmentType;
      let businessStatus: BusinessContextStatus;
      let matchedTarget: LocationTruthMatchedTarget | undefined;

      if (match.matchedTarget.type === 'private_residence') {
        segmentType = 'private_residence';
        businessStatus = 'matched_eventflow_target';
        matchedTarget = {
          targetType: 'private_zone',
          targetId: match.matchedTarget.targetId ?? 'private',
          label: match.matchedTarget.label,
        };
        physDiag.clustersWithKnownTargetCount++;
      } else if (isMatchedToTarget(match.matchedTarget.type)) {
        segmentType = 'known_target';
        businessStatus = 'matched_eventflow_target';
        const tt = mapMatchTypeToTargetType(match.matchedTarget.type);
        if (tt && match.matchedTarget.targetId) {
          matchedTarget = {
            targetType: tt,
            targetId: match.matchedTarget.targetId,
            label: match.matchedTarget.label,
          };
        }
        physDiag.clustersWithKnownTargetCount++;

        // Lager 2.3c — supplier-special: tagga besök + flagga om personen
        // var planerad på projekt/booking/LP samtidigt (Lager 3 avgör om det
        // är hämtning/lämning kopplad till projekt).
        if (match.matchedTarget.type === 'supplier') {
          supplierDiag.supplierMatchedClusterCount++;
          businessWarnings.push('supplier_visit');
          const competing = match.candidates.filter(
            (c) => c.targetId !== match.matchedTarget.targetId,
          ).length;
          if (competing > 0) supplierDiag.competingSupplierTargetCount++;
          const plannedProjectOrBooking = assignments.some(
            (a) => a.bookingId || a.projectId || a.largeProjectId,
          );
          if (plannedProjectOrBooking) {
            businessWarnings.push('supplier_visit_during_planned_project');
            supplierDiag.supplierPlanningMismatchCount++;
          }
          if (supplierDiag.examples.length < 5) {
            supplierDiag.examples.push({
              clusterId: cluster.id,
              supplierTargetId: match.matchedTarget.targetId,
              supplierLabel: match.matchedTarget.label,
              confidence: match.confidence,
              distanceMeters: match.candidates.find(
                (c) => c.targetId === match.matchedTarget.targetId,
              )?.distanceMeters,
              competingCandidateCount: competing,
              warnings: [...businessWarnings],
            });
          }
        }
      } else if (match.matchedTarget.type === 'needs_location_review') {
        // Reserveras för konflikt som kräver mänsklig bedömning,
        // t.ex. LP saknar geo men assignment pekar dit.
        segmentType = 'needs_location_review';
        businessStatus = 'needs_review';
        physDiag.unresolvedLocationCount++;
        businessWarnings.push('large_project_missing_geo_or_planning_conflict');
      } else {
        // match.matchedTarget.type === 'unknown_area' — ingen EventFlow-target.
        // Avgör nu fysisk-plats-styrkan: stabilt kluster ⇒ known_address,
        // svagt kluster ⇒ unresolved_location.
        // Lager 2.3b: stabilt kluster (≥minStablePings + sammanhängande område)
        // räcker för known_address även om GPS-confidence är låg — vi sänker
        // bara segmentets confidence i så fall. unresolved_location reserveras
        // för icke-stabila/för-få-pings-fall (cluster.isStable=false).
        const clusterStrongEnough = cluster.isStable;
        if (clusterStrongEnough) {
          segmentType = 'known_address';
          businessStatus = match.planningIgnoredBecauseGeoDisagreed
            ? 'planning_geo_mismatch'
            : 'unresolved_business_context';
          businessWarnings.push('no_eventflow_target_match');
          if (match.planningIgnoredBecauseGeoDisagreed) {
            businessWarnings.push('planned_target_does_not_match_physical_location');
          }
          physDiag.clustersWithKnownAddressNoTargetCount++;
          physDiag.noEventFlowTargetMatchCount++;
          if (phys.centroidOnly) physDiag.centroidOnlyAddressCount++;
        } else {
          segmentType = 'unresolved_location';
          businessStatus = 'no_target_match';
          physDiag.unresolvedLocationCount++;
        }
      }

      const businessContext: LocationTruthBusinessContext = {
        status: businessStatus,
        matchedTarget,
        warnings: businessWarnings.length ? businessWarnings : undefined,
      };

      const segment: LocationTruthSegment = {
        id: `seg_${cluster.id}`,
        staffId: dayEvidence.staffId,
        startAt: cluster.startAt,
        endAt: cluster.endAt,
        type: segmentType,
        finalType: 'unknown_area', // sätts korrekt i Lager 2.6-mappning nedan
        matchedTarget,
        physicalLocation: phys.physicalLocation,
        businessContext,
        confidence: match.confidence,
        evidence: {
          pingCount: cluster.pingCount,
          centroidLat: cluster.centroidLat,
          centroidLng: cluster.centroidLng,
          medianAccuracyMeters: cluster.medianAccuracyMeters ?? undefined,
          assignmentSupportsTarget:
            match.candidates.find(
              (c) => c.targetId === match.matchedTarget.targetId,
            )?.assignmentSupports ?? false,
        },
        warnings: segWarnings.concat(match.warnings),
        diagnostics: {
          sourcePingIds: cluster.sourcePingIds,
          decisionReason: match.decisionReason,
          rejectedReasons: match.rejectedCandidates
            .map((r) => r.rejectReason)
            .filter((x): x is string => !!x),
        },
      };

      segments.push(segment);
      counts.segments++;
      counts.segmentsByType[segmentType]++;

      if (physDiag.examples.length < 5) {
        physDiag.examples.push({
          clusterId: cluster.id,
          segmentType,
          physicalLocationSource: phys.physicalLocation.source,
          businessContextStatus: businessStatus,
          matchedTargetType: matchedTarget?.targetType,
          label: phys.physicalLocation.label,
          warnings: segWarnings,
        });
      }
    }
  } catch (err) {
    warnings.push(
      `location_truth_segment_build_failed:${(err as Error).message}`,
    );
  }

  // Lager 2.4 — försiktig gap-policy: bridgea signalglapp där samma target
  // ligger före/efter, markera transition_candidate vid olika targets.
  let bridgedSegments = segments;
  let gapBridgeDiagnostics: GapBridgeDiagnostics | null = null;
  try {
    const bridge = bridgeSignalGaps(segments);
    bridgedSegments = bridge.segments;
    gapBridgeDiagnostics = bridge.diagnostics;
    // Uppdatera segment-räknare efter bridging.
    counts.segments = bridgedSegments.length;
    const byType: Record<LocationTruthSegmentType, number> = {
      known_target: 0,
      known_address: 0,
      private_residence: 0,
      movement: 0,
      unresolved_location: 0,
      needs_location_review: 0,
    };
    for (const s of bridgedSegments) byType[s.type]++;
    counts.segmentsByType = byType;
  } catch (err) {
    warnings.push(`location_truth_gap_bridge_failed:${(err as Error).message}`);
  }


  // Lager 2.5 — verklig förflyttning: skapa movement-segment ENDAST när
  // pings emellan styrker faktisk route mellan två olika stabila platser.
  let finalSegments = bridgedSegments;
  let movementDiagnostics: MovementDiagnostics | null = null;
  try {
    const mv = detectTrueMovement(bridgedSegments, logicPings);
    finalSegments = mv.segments;
    movementDiagnostics = mv.diagnostics;
    // Räkna om segmenttyper efter movement-injektion.
    counts.segments = finalSegments.length;
    const byType: Record<LocationTruthSegmentType, number> = {
      known_target: 0,
      known_address: 0,
      private_residence: 0,
      movement: 0,
      unresolved_location: 0,
      needs_location_review: 0,
    };
    for (const s of finalSegments) byType[s.type]++;
    counts.segmentsByType = byType;
  } catch (err) {
    warnings.push(`location_truth_movement_failed:${(err as Error).message}`);
  }

  // Lager 2.6 — sätt kanonisk finalType per segment och bygg summary.
  const finalSummary: LocationTruthSummary = {
    inputPingCount: logicPings?.length ?? 0,
    clusterCount: stableClusters.length,
    finalSegmentCount: 0,
    knownSiteSegmentCount: 0,
    movementSegmentCount: 0,
    privateResidenceSegmentCount: 0,
    unknownAreaSegmentCount: 0,
    reviewSegmentCount: 0,
    bridgedGapMinutesTotal: 0,
    ignoredOutlierPingCount: stableClusterDiagnostics?.ignoredOutlierPingCount ?? 0,
    finalSegmentsByType: {
      known_site: 0,
      movement: 0,
      private_residence: 0,
      unknown_area: 0,
      needs_location_review: 0,
    },
    examples: [],
  };

  for (const s of finalSegments) {
    s.finalType = mapToFinalType(s);
    finalSummary.finalSegmentCount++;
    finalSummary.finalSegmentsByType[s.finalType]++;
    finalSummary.bridgedGapMinutesTotal +=
      s.diagnostics.bridgedSignalGapMinutes ?? 0;
    switch (s.finalType) {
      case 'known_site':
        finalSummary.knownSiteSegmentCount++;
        break;
      case 'movement':
        finalSummary.movementSegmentCount++;
        break;
      case 'private_residence':
        finalSummary.privateResidenceSegmentCount++;
        break;
      case 'unknown_area':
        finalSummary.unknownAreaSegmentCount++;
        break;
      case 'needs_location_review':
        finalSummary.reviewSegmentCount++;
        break;
    }
    if (finalSummary.examples.length < 8) {
      finalSummary.examples.push({
        segmentId: s.id,
        finalType: s.finalType,
        confidence: s.confidence,
        label: targetLabelOf(s),
        targetType: s.matchedTarget?.targetType,
        startAt: s.startAt,
        endAt: s.endAt,
        warnings: s.warnings ?? [],
      });
    }
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
    targetMatchDiagnostics: targetDiag,
    physicalLocationDiagnostics: physDiag,
    supplierMatchDiagnostics: supplierDiag,
    gapBridgeDiagnostics,
    movementDiagnostics,
    locationTruthSummary: finalSummary,
  };

  return { segments: finalSegments, diagnostics, stableClusters, clusterMatches };
}
