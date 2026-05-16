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
  /** Lager 2.11F — alias för clustersWithKnownAddressNoTargetCount. */
  knownAddressNoTargetCount: number;
  unresolvedLocationCount: number;
  reverseGeocodeUsedCount: number;
  centroidOnlyAddressCount: number;
  noEventFlowTargetMatchCount: number;
  planningGeoMismatchCount: number;
  /** Lager 2.11F — businessContext-utfall per typ. */
  supplierVisitCount: number;
  warehousePresenceCount: number;
  unassignedProjectPresenceCount: number;
  largeProjectMissingGeoBusinessWarningCount: number;
  /** Lager 2.11F — physicalLocation.address fyllnadsgrad. */
  physicalLocationAddressFilledCount: number;
  physicalLocationAddressMissingCount: number;
  /** Lager 2.12B — tidsbaserad assignment-overlap. */
  overlappingAssignmentCount: number;
  nonOverlappingAssignmentIgnoredCount: number;
  assignmentMissingTimeWindowCount: number;
  planningWarningsSuppressedNoOverlapCount: number;
  examples: Array<{
    clusterId: string;
    segmentType: LocationTruthSegmentType;
    physicalLocationSource: PhysicalLocation['source'];
    physicalLocationLabel?: string;
    physicalLocationAddress?: string | null;
    businessContextStatus: BusinessContextStatus;
    matchedTarget?: LocationTruthMatchedTarget;
    /** @deprecated använd matchedTarget.targetType. */
    matchedTargetType?: LocationTruthTargetType;
    /** @deprecated använd physicalLocationLabel. */
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
/**
 * Final platsalfabet (Lager 2.6 reviderat).
 *
 * Viktig distinktion:
 * - `unresolved_location` betyder att vi INTE kan avgöra fysisk plats
 *   (för få/spridda pings, ingen stabil centroid, ingen reverse-geocode).
 * - `known_address` betyder att fysisk plats ÄR avgjord (stabil centroid /
 *   adress) men ingen EventFlow-target (booking/projekt/lager) kan kopplas.
 *   Det är `unresolved_business_context`, INTE okänd plats.
 *
 * `unknown_area` finns INTE längre — använd `unresolved_location`
 * (fysisk plats okänd) eller `known_address` (plats känd, business okänd).
 */
export type FinalLocationTruthSegmentType =
  | 'known_site'
  | 'known_address'
  | 'movement'
  | 'private_residence'
  | 'unresolved_location'
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
  | 'unassigned_known_target_presence'
  | 'supplier_visit'
  | 'warehouse_presence'
  | 'organization_location_presence'
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

/** Map Trace 4 — kompakt vy av matchKandidat för diagnos i UI. */
export interface LocationTruthMatchCandidateDiag {
  targetType: string;
  targetId: string;
  label: string;
  distanceMeters: number;
  effectiveRadiusMeters: number;
  insideRadius: boolean;
  priority: number;
  assignmentSupports: boolean;
  rejected: boolean;
  rejectReason?: string;
}

/** Map Trace 4 — komplett platsmatchnings-trace per segment. */
export interface LocationTruthMatchDiagnostics {
  matchedTarget: {
    type: string;
    targetId: string | null;
    label: string;
    knownTargetType: string | null;
  };
  decisionReason: string;
  confidence: 'high' | 'medium' | 'low';
  candidates: LocationTruthMatchCandidateDiag[];
  rejectedCandidates: LocationTruthMatchCandidateDiag[];
  warnings: string[];
  planningUsedAsTieBreaker: boolean;
  planningIgnoredBecauseGeoDisagreed: boolean;
}

export interface LocationTruthPhysicalLocationDiag {
  label?: string;
  address?: string;
  lat: number;
  lng: number;
  source: PhysicalLocation['source'];
  confidence: 'high' | 'medium' | 'low';
  /** True om endast centroid kunde användas (ingen target, ingen reverse-geocode). */
  centroidOnly: boolean;
  /** True om reverse-geocode användes. */
  reverseGeocodeUsed: boolean;
  /** Warnings från resolvePhysicalLocationForCluster. */
  warnings: string[];
}

export interface LocationTruthSegmentDiagnostics {
  sourcePingIds?: string[];
  bridgedSignalGapMinutes?: number;
  ignoredOutlierPingCount?: number;
  competingTargets?: unknown[];
  rejectedReasons?: string[];
  decisionReason?: string;
  /** Map Trace 4 — full platsmatchnings-trace (kandidater, rejects, beslut). */
  match?: LocationTruthMatchDiagnostics;
  /** Map Trace 4 — fysisk plats med källa och konfidens. */
  physicalLocation?: LocationTruthPhysicalLocationDiag;
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
  knownAddressSegmentCount: number;
  unresolvedLocationSegmentCount: number;
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
  const hasStrongReview = (seg.warnings ?? []).some((w) =>
    STRONG_REVIEW_WARNINGS.has(w),
  );
  switch (seg.type) {
    case 'known_target':
      return hasStrongReview ? 'needs_location_review' : 'known_site';
    case 'private_residence':
      return 'private_residence';
    case 'movement':
      return 'movement';
    case 'needs_location_review':
      return 'needs_location_review';
    case 'known_address':
      // Fysisk plats är känd (stabil centroid/adress). Saknad
      // booking/projekt/lager = unresolved_business_context, inte okänd plats.
      return hasStrongReview ? 'needs_location_review' : 'known_address';
    case 'unresolved_location':
      // Fysisk plats kan inte avgöras (för få/spridda pings).
      return hasStrongReview ? 'needs_location_review' : 'unresolved_location';
    default:
      return 'unresolved_location';
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
    knownAddressNoTargetCount: 0,
    unresolvedLocationCount: 0,
    reverseGeocodeUsedCount: 0,
    centroidOnlyAddressCount: 0,
    noEventFlowTargetMatchCount: 0,
    planningGeoMismatchCount: 0,
    supplierVisitCount: 0,
    warehousePresenceCount: 0,
    unassignedProjectPresenceCount: 0,
    largeProjectMissingGeoBusinessWarningCount: 0,
    physicalLocationAddressFilledCount: 0,
    physicalLocationAddressMissingCount: 0,
    overlappingAssignmentCount: 0,
    nonOverlappingAssignmentIgnoredCount: 0,
    assignmentMissingTimeWindowCount: 0,
    planningWarningsSuppressedNoOverlapCount: 0,
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

  // Lager 2.12B — tidsbaserad assignment-overlap.
  // Returnerar assignments där [startAt,endAt) överlappar segmentets
  // [segStart,segEnd). Assignments utan tidsfönster räknas som "weak context"
  // och returneras INTE här (de räknas separat i diagnostics).
  function getOverlappingAssignments(
    segStart: string,
    segEnd: string,
  ): typeof assignments {
    const segS = Date.parse(segStart);
    const segE = Date.parse(segEnd);
    const out: typeof assignments = [];
    for (const a of assignments) {
      if (!a.startAt || !a.endAt) {
        physDiag.assignmentMissingTimeWindowCount++;
        continue;
      }
      const aS = Date.parse(a.startAt);
      const aE = Date.parse(a.endAt);
      if (!Number.isFinite(aS) || !Number.isFinite(aE)) {
        physDiag.assignmentMissingTimeWindowCount++;
        continue;
      }
      if (aS < segE && aE > segS) {
        out.push(a);
      } else {
        physDiag.nonOverlappingAssignmentIgnoredCount++;
      }
    }
    return out;
  }

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
        case 'no_eventflow_target_match':
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
        const tt = mapMatchTypeToTargetType(match.matchedTarget.type);
        if (tt && match.matchedTarget.targetId) {
          matchedTarget = {
            targetType: tt,
            targetId: match.matchedTarget.targetId,
            label: match.matchedTarget.label,
          };
        }
        physDiag.clustersWithKnownTargetCount++;

        const winner = match.candidates.find(
          (c) => c.targetId === match.matchedTarget.targetId,
        );
        const assignmentSupports = winner?.assignmentSupports ?? false;
        const matchedKind = match.matchedTarget.type;

        // Lager 2.12B — tidsbaserad: planning räknas bara om assignment
        // tidsmässigt överlappar segmentet. Day-level "har en assignment
        // någonstans idag" räcker inte.
        const overlappingAssignments = getOverlappingAssignments(
          cluster.startAt,
          cluster.endAt,
        );
        const hasOverlappingAssignment = overlappingAssignments.length > 0;
        if (hasOverlappingAssignment) physDiag.overlappingAssignmentCount++;

        // Lager 2.11C — businessContext beror på targetType.
        if (matchedKind === 'supplier') {
          // Supplier-besök: assignment krävs aldrig.
          businessStatus = 'supplier_visit';
          supplierDiag.supplierMatchedClusterCount++;
          if (!hasOverlappingAssignment) {
            businessWarnings.push('supplier_visit_without_project_context');
            // Om det fanns dag-assignments men ingen överlapp → suppress.
            if (assignments.length > 0) {
              physDiag.planningWarningsSuppressedNoOverlapCount++;
            }
          } else {
            businessWarnings.push('supplier_visit_during_planned_project');
            supplierDiag.supplierPlanningMismatchCount++;
          }
          const competing = match.candidates.filter(
            (c) => c.targetId !== match.matchedTarget.targetId,
          ).length;
          if (competing > 0) supplierDiag.competingSupplierTargetCount++;
          if (supplierDiag.examples.length < 5) {
            supplierDiag.examples.push({
              clusterId: cluster.id,
              supplierTargetId: match.matchedTarget.targetId,
              supplierLabel: match.matchedTarget.label,
              confidence: match.confidence,
              distanceMeters: winner?.distanceMeters,
              competingCandidateCount: competing,
              warnings: [...businessWarnings],
            });
          }
        } else if (matchedKind === 'warehouse') {
          // Lager-närvaro: assignment krävs aldrig.
          businessStatus = 'warehouse_presence';
          if (hasOverlappingAssignment) {
            businessWarnings.push('warehouse_presence_during_planned_project');
          } else if (assignments.length > 0) {
            physDiag.planningWarningsSuppressedNoOverlapCount++;
          }
        } else if (matchedKind === 'organization_location') {
          // Org-location: assignment krävs aldrig.
          businessStatus = 'organization_location_presence';
        } else {
          // project / booking / large_project — assignment förväntas.
          if (assignmentSupports) {
            businessStatus = 'matched_eventflow_target';
          } else {
            businessStatus = 'unassigned_known_target_presence';
            businessWarnings.push('staff_not_assigned_to_matched_target');
          }
        }

        // Planning pekar på annan fysisk plats men GPS vinner.
        // Lager 2.12B — gate på faktisk tids-overlap. Om den planerade
        // assignmenten inte överlappar segmentet är detta inte en mismatch.
        if (match.planningIgnoredBecauseGeoDisagreed) {
          // Hitta planerade rejected candidates och se om någon av dem har
          // en assignment som tidsmässigt överlappar.
          const plannedRejected = match.rejectedCandidates.filter(
            (r) => r.assignmentSupports,
          );
          const overlappingTargetIds = new Set<string>();
          for (const a of overlappingAssignments) {
            if (a.bookingId) overlappingTargetIds.add(`b:${a.bookingId}`);
            if (a.projectId) overlappingTargetIds.add(`p:${a.projectId}`);
            if (a.largeProjectId) overlappingTargetIds.add(`lp:${a.largeProjectId}`);
          }
          const plannedOverlapsSegment = plannedRejected.some((r: any) => {
            const tid = r.targetId ?? r.target_id;
            const tt = r.targetType ?? r.target_type;
            if (!tid) return false;
            const key =
              tt === 'booking' ? `b:${tid}` :
              tt === 'project' ? `p:${tid}` :
              tt === 'large_project' ? `lp:${tid}` : null;
            return key ? overlappingTargetIds.has(key) : false;
          });

          if (plannedOverlapsSegment) {
            businessStatus = 'planning_geo_mismatch';
            if (!businessWarnings.includes('planned_target_does_not_match_physical_location')) {
              businessWarnings.push('planned_target_does_not_match_physical_location');
            }
            // Lager 2.11E — om den planerade targeten faktiskt SAKNAR egen geo
            // (typiskt assigned LP utan koordinater) ska vi även markera det.
            const plannedMissingGeo = plannedRejected.some(
              (r) => r.rejectReason === 'large_project_missing_geo',
            );
            if (plannedMissingGeo && !businessWarnings.includes('planned_target_missing_geo')) {
              businessWarnings.push('planned_target_missing_geo');
            }
          } else {
            // Planering finns men överlappar inte segmentet → suppress.
            physDiag.planningWarningsSuppressedNoOverlapCount++;
          }
        }
      } else if (match.matchedTarget.type === 'needs_location_review') {
        // Lager 2.10/2.11E — mjukare hantering. needs_location_review ska
        // bara användas om fysisk plats faktiskt är okänd eller om det finns
        // verklig konflikt. Om klustret är stabilt har vi en känd fysisk
        // plats även om LP saknar egen geo → known_address + needs_review.
        if (cluster.isStable) {
          segmentType = 'known_address';
          businessStatus = 'needs_review';
          businessWarnings.push('large_project_missing_geo');
          businessWarnings.push('business_target_missing_geo');
          businessWarnings.push('planning_target_missing_geo');
          businessWarnings.push('assigned_large_project_missing_geo');
          physDiag.clustersWithKnownAddressNoTargetCount++;
          if (phys.centroidOnly) physDiag.centroidOnlyAddressCount++;
        } else {
          segmentType = 'needs_location_review';
          businessStatus = 'needs_review';
          physDiag.unresolvedLocationCount++;
          businessWarnings.push('large_project_missing_geo_or_planning_conflict');
        }
      } else {
        // match.matchedTarget.type === 'no_eventflow_target_match' (Lager 2.11D).
        // Avgör nu fysisk-plats-styrkan: stabilt kluster ⇒ known_address,
        // svagt kluster ⇒ unresolved_location.
        const clusterStrongEnough = cluster.isStable;
        // Lager 2.12C — match-helpern signalerar nu LP-missing-geo direkt här
        // (i stället för needs_location_review). Plocka upp det som
        // business/data-quality-problem snarare än fysisk-plats-okänt.
        const lpMissingGeoSignaled =
          match.warnings.includes('assigned_large_project_missing_geo') ||
          match.warnings.includes('large_project_missing_geo');
        if (clusterStrongEnough) {
          segmentType = 'known_address';
          if (lpMissingGeoSignaled) {
            businessStatus = 'needs_review';
            businessWarnings.push('large_project_missing_geo');
            businessWarnings.push('business_target_missing_geo');
            businessWarnings.push('assigned_large_project_missing_geo');
            businessWarnings.push('planning_target_missing_geo');
          } else {
            businessStatus = match.planningIgnoredBecauseGeoDisagreed
              ? 'planning_geo_mismatch'
              : 'unresolved_business_context';
            businessWarnings.push('no_eventflow_target_match');
            if (match.planningIgnoredBecauseGeoDisagreed) {
              businessWarnings.push('planned_target_does_not_match_physical_location');
            }
            physDiag.noEventFlowTargetMatchCount++;
          }
          physDiag.clustersWithKnownAddressNoTargetCount++;
          if (phys.centroidOnly) physDiag.centroidOnlyAddressCount++;
        } else {
          if (lpMissingGeoSignaled) {
            // Svagt kluster + LP utan geo → genuin platsgranskning behövs.
            segmentType = 'needs_location_review';
            businessStatus = 'needs_review';
            businessWarnings.push('large_project_missing_geo_or_planning_conflict');
          } else {
            segmentType = 'unresolved_location';
            businessStatus = 'no_target_match';
          }
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
        finalType: 'unresolved_location', // sätts korrekt i Lager 2.6-mappning nedan
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

      // Lager 2.11F — räkna business-status och physicalLocation.address.
      if (businessStatus === 'supplier_visit') physDiag.supplierVisitCount++;
      if (businessStatus === 'warehouse_presence') physDiag.warehousePresenceCount++;
      if (businessStatus === 'unassigned_known_target_presence') physDiag.unassignedProjectPresenceCount++;
      if (
        businessWarnings.includes('large_project_missing_geo') ||
        businessWarnings.includes('assigned_large_project_missing_geo') ||
        businessWarnings.includes('planned_target_missing_geo')
      ) {
        physDiag.largeProjectMissingGeoBusinessWarningCount++;
      }
      const addr = phys.physicalLocation.address;
      if (typeof addr === 'string' && addr.trim().length > 0) {
        physDiag.physicalLocationAddressFilledCount++;
      } else {
        physDiag.physicalLocationAddressMissingCount++;
      }

      if (physDiag.examples.length < 5) {
        physDiag.examples.push({
          clusterId: cluster.id,
          segmentType,
          physicalLocationSource: phys.physicalLocation.source,
          physicalLocationLabel: phys.physicalLocation.label,
          physicalLocationAddress: phys.physicalLocation.address ?? null,
          businessContextStatus: businessStatus,
          matchedTarget,
          matchedTargetType: matchedTarget?.targetType,
          label: phys.physicalLocation.label,
          warnings: [...segWarnings, ...businessWarnings],
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
    knownAddressSegmentCount: 0,
    unresolvedLocationSegmentCount: 0,
    reviewSegmentCount: 0,
    bridgedGapMinutesTotal: 0,
    ignoredOutlierPingCount: stableClusterDiagnostics?.ignoredOutlierPingCount ?? 0,
    finalSegmentsByType: {
      known_site: 0,
      known_address: 0,
      movement: 0,
      private_residence: 0,
      unresolved_location: 0,
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
      case 'known_address':
        finalSummary.knownAddressSegmentCount++;
        break;
      case 'movement':
        finalSummary.movementSegmentCount++;
        break;
      case 'private_residence':
        finalSummary.privateResidenceSegmentCount++;
        break;
      case 'unresolved_location':
        finalSummary.unresolvedLocationSegmentCount++;
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

  // Lager 2.11F — alias-spegling.
  physDiag.knownAddressNoTargetCount = physDiag.clustersWithKnownAddressNoTargetCount;

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
