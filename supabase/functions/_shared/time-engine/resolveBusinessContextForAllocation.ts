/**
 * Time Engine Core Fix 2 — Business Context Resolution
 * ─────────────────────────────────────────────────────
 *
 * Pure helper. Givet ETT LocationTruth-segment, dess överlappande
 * planning-assignments och known_targets, returnerar en strukturerad
 * "business context resolution" som beslutar vilken arbetskontext som
 * ska användas innan motorn faller tillbaka på "okopplad adress".
 *
 * PRIO för matchning:
 *   1. Exakt/nära known work target med geo (sätts INNAN denna helper i Lager 2)
 *   2. Planerad assignment för personen samma tid (utan geo) →
 *      assignment_without_geo, target_missing_geo-warning
 *   3. Warehouse/org-location → no_assignment_required
 *   4. Large project vinner alltid över child bookings
 *   5. Konkurrerande projekt/booking-targets → competing_targets, review
 *   6. Inget rimligt → stable_address_no_target (unlinked) eller unknown_location
 *
 * Skriver ALDRIG. Returnerar bara en beslutsbeskrivning.
 */
import type {
  LocationTruthSegment,
  LocationTruthTargetType,
} from './buildLocationTruthFromDayEvidence.ts';
import type { AssignmentEvidenceItem } from './buildAssignmentEvidence.ts';
import type { KnownTargetEvidenceItem } from './buildKnownTargetsEvidence.ts';

export type BusinessContextFallback =
  | 'none'
  | 'assignment_without_geo'
  | 'stable_address_no_target'
  | 'unknown_location';

export type BusinessContextSelectedTargetType =
  | LocationTruthTargetType
  | 'unlinked_address'
  | 'unknown'
  | null;

export interface BusinessContextCandidate {
  targetType: LocationTruthTargetType;
  targetId: string | null;
  label: string | null;
  distanceMeters: number | null;
  hasGeo: boolean;
  fromAssignment: boolean;
  fromPlanning: boolean;
  fromKnownTarget: boolean;
  score: number;
  rejectedReason?: string | null;
}

export interface BusinessContextResolution {
  selectedTargetType: BusinessContextSelectedTargetType;
  selectedTargetId: string | null;
  selectedTargetLabel: string | null;
  selectedReason: string;
  candidates: BusinessContextCandidate[];
  fallbackUsed: BusinessContextFallback;
  /** Warnings att lägga till på allocation-segmentet. */
  extraWarnings: string[];
  /** Om verkligt konkurrerande targets förekommer (≥2 olika project/booking/lp). */
  competingTargets: boolean;
}

const PRIORITY: Record<LocationTruthTargetType, number> = {
  warehouse: 1,
  organization_location: 1,
  supplier: 2,
  large_project: 3,
  project: 4,
  booking: 5,
  private_zone: 9,
};

function targetByKey(
  knownTargets: KnownTargetEvidenceItem[],
  kind: 'large_project' | 'project' | 'booking',
  id: string,
): KnownTargetEvidenceItem | null {
  return (
    knownTargets.find(
      (t) => t.targetType === kind && t.targetId === id,
    ) ?? null
  );
}

function labelOf(t: KnownTargetEvidenceItem | null, fallback?: string | null): string | null {
  return t?.label ?? fallback ?? null;
}

/**
 * Bygger BusinessContext-kandidater utifrån överlappande assignments.
 * Large project vinner alltid över child bookings (per produktregel).
 */
function buildCandidatesFromAssignments(
  overlappingAssignments: AssignmentEvidenceItem[],
  knownTargets: KnownTargetEvidenceItem[],
): BusinessContextCandidate[] {
  const out: BusinessContextCandidate[] = [];
  const lpIds = new Set<string>();
  for (const a of overlappingAssignments) {
    if (a.largeProjectId) lpIds.add(a.largeProjectId);
  }

  const seen = new Set<string>();
  for (const a of overlappingAssignments) {
    // LP vinner alltid över child booking — om assignmenten tillhör en LP
    // räknar vi LP, inte child-booking.
    if (a.largeProjectId) {
      const key = `large_project:${a.largeProjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kt = targetByKey(knownTargets, 'large_project', a.largeProjectId);
      out.push({
        targetType: 'large_project',
        targetId: a.largeProjectId,
        label: labelOf(kt, a.title ?? null),
        distanceMeters: null,
        hasGeo: !!kt?.hasCoordinates,
        fromAssignment: true,
        fromPlanning: true,
        fromKnownTarget: !!kt,
        score: 100 - PRIORITY.large_project,
      });
      continue;
    }
    if (a.bookingId && !a.belongsToLargeProject) {
      const key = `booking:${a.bookingId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kt = targetByKey(knownTargets, 'booking', a.bookingId);
      out.push({
        targetType: 'booking',
        targetId: a.bookingId,
        label: labelOf(kt, a.title ?? null),
        distanceMeters: null,
        hasGeo: !!kt?.hasCoordinates,
        fromAssignment: true,
        fromPlanning: true,
        fromKnownTarget: !!kt,
        score: 100 - PRIORITY.booking,
      });
    }
    if (a.projectId) {
      const key = `project:${a.projectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kt = targetByKey(knownTargets, 'project', a.projectId);
      out.push({
        targetType: 'project',
        targetId: a.projectId,
        label: labelOf(kt, a.title ?? null),
        distanceMeters: null,
        hasGeo: !!kt?.hasCoordinates,
        fromAssignment: true,
        fromPlanning: true,
        fromKnownTarget: !!kt,
        score: 100 - PRIORITY.project,
      });
    }
  }
  return out;
}

export interface ResolveBusinessContextInput {
  seg: LocationTruthSegment;
  /** Assignments som tidsmässigt överlappar segmentintervallet. */
  overlappingAssignments: AssignmentEvidenceItem[];
  knownTargets: KnownTargetEvidenceItem[];
  /** True om segmentet är fysiskt stabilt (known_address eller known_site). */
  physicallyStable: boolean;
}

/**
 * Huvudfunktion. Beslutar business context-target och fallback.
 *
 * Notera: när Lager 2 redan har matchat ett geo-target (seg.matchedTarget
 * är satt) återanvänder vi det och returnerar fallbackUsed='none'.
 */
export function resolveBusinessContextForAllocation(
  input: ResolveBusinessContextInput,
): BusinessContextResolution {
  const { seg, overlappingAssignments, knownTargets, physicallyStable } = input;
  const matched = seg.businessContext?.matchedTarget ?? seg.matchedTarget;

  // Bygg alltid assignment-kandidater för diagnostics — även när vi inte
  // använder dem som fallback. Lager 2 kan ha valt ett annat target.
  const assignmentCandidates = buildCandidatesFromAssignments(
    overlappingAssignments,
    knownTargets,
  );

  // 1) Lager 2 har redan valt ett geo-matchat target (known_site).
  if (matched && matched.targetType && matched.targetId) {
    return {
      selectedTargetType: matched.targetType,
      selectedTargetId: matched.targetId,
      selectedTargetLabel: matched.label ?? null,
      selectedReason: 'layer2_geo_matched_known_target',
      candidates: [
        {
          targetType: matched.targetType,
          targetId: matched.targetId,
          label: matched.label ?? null,
          distanceMeters: seg.evidence.distanceToTargetMeters ?? null,
          hasGeo: true,
          fromAssignment: false,
          fromPlanning: false,
          fromKnownTarget: true,
          score: 200 - (PRIORITY[matched.targetType] ?? 5),
        },
        ...assignmentCandidates,
      ],
      fallbackUsed: 'none',
      extraWarnings: [],
      competingTargets: false,
    };
  }

  // 2) Inget geo-matchat target. Pröva planerings-assignments som
  //    business-context-fallback INNAN vi faller till unlinked_address.

  // Distinkta target-typer i assignment-kandidaterna.
  const distinctKeys = new Set(
    assignmentCandidates.map((c) => `${c.targetType}:${c.targetId}`),
  );

  if (assignmentCandidates.length > 0) {
    // Sortera: LP först, sedan project, sedan booking, sedan på score.
    const sorted = [...assignmentCandidates].sort(
      (a, b) =>
        (PRIORITY[a.targetType] ?? 9) - (PRIORITY[b.targetType] ?? 9) ||
        b.score - a.score,
    );
    const top = sorted[0];

    // Konkurrerande targets om vi har ≥2 distinkta som INTE bara är
    // LP+child-booking-relation (LP-regeln tar bort barnen redan).
    const competing = distinctKeys.size >= 2;

    // Om competing och ingen LP vinner deterministiskt → review.
    if (competing && top.targetType !== 'large_project') {
      return {
        selectedTargetType: 'unknown',
        selectedTargetId: null,
        selectedTargetLabel: null,
        selectedReason: 'competing_assignment_targets_no_lp_winner',
        candidates: sorted,
        fallbackUsed: 'unknown_location',
        extraWarnings: ['competing_targets', 'needs_review_business_context'],
        competingTargets: true,
      };
    }

    // Annars: använd top som business context utan geo.
    return {
      selectedTargetType: top.targetType,
      selectedTargetId: top.targetId,
      selectedTargetLabel: top.label,
      selectedReason: top.targetType === 'large_project'
        ? 'assignment_large_project_without_geo'
        : 'assignment_without_geo',
      candidates: sorted,
      fallbackUsed: 'assignment_without_geo',
      extraWarnings: top.hasGeo
        ? ['business_context_from_assignment']
        : ['business_context_from_assignment', 'target_missing_geo'],
      competingTargets: competing,
    };
  }

  // 3) Inget assignment heller. Fysiskt stabil plats utan target → unlinked.
  if (physicallyStable) {
    return {
      selectedTargetType: 'unlinked_address',
      selectedTargetId: null,
      selectedTargetLabel: seg.physicalLocation?.label ?? null,
      selectedReason: 'stable_address_without_target_or_assignment',
      candidates: [],
      fallbackUsed: 'stable_address_no_target',
      extraWarnings: ['no_project_link'],
      competingTargets: false,
    };
  }

  // 4) Inget alls.
  return {
    selectedTargetType: 'unknown',
    selectedTargetId: null,
    selectedTargetLabel: null,
    selectedReason: 'no_physical_location_no_assignment',
    candidates: [],
    fallbackUsed: 'unknown_location',
    extraWarnings: [],
    competingTargets: false,
  };
}
