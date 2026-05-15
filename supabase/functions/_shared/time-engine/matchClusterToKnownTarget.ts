/**
 * matchClusterToKnownTarget (Time Engine — Lager 2.3)
 *
 * Pure helper. Tar ETT stabilt platskluster och matchar det mot fysisk plats:
 *   1. private/home (om starkt)
 *   2. warehouse / organization_location
 *   3. large_project (egen geo)
 *   4. project (ej child under large_project)
 *   5. booking (ej child under large_project)
 *   6. no_eventflow_target_match / needs_location_review
 *
 * Lager 2.11D — 'unknown_area' är borttaget. När ingen EventFlow-target
 * matchar returneras 'no_eventflow_target_match'. Lager 2 avgör sedan om
 * fysisk plats är känd (known_address) eller okänd (unresolved_location)
 * baserat på klustrets stabilitet.
 *
 * Regler:
 *  - GPS är primär bevisning. Planning är CONTEXT/tie-breaker, aldrig proof.
 *  - Large project matchas på SIN EGNA geo. Child booking/project är aldrig
 *    primary target och aldrig geo-fallback. Saknas LP-geo → warning + ev.
 *    needs_location_review (ingen fallback till barn).
 *  - Assignment kan höja confidence eller bryta tie men aldrig göra en
 *    geografiskt orimlig plats till final target.
 */

import type {
  KnownTargetEvidenceItem,
  KnownTargetType,
} from './buildKnownTargetsEvidence.ts';
import type { AssignmentEvidenceItem } from './buildAssignmentEvidence.ts';
import type { StableLocationCluster } from './buildStableLocationClusters.ts';

// ── Output ────────────────────────────────────────────────────────────────

export type MatchedTargetType =
  | 'warehouse'
  | 'organization_location'
  | 'supplier'
  | 'large_project'
  | 'project'
  | 'booking'
  | 'private_residence'
  | 'no_eventflow_target_match'
  | 'needs_location_review';

export interface MatchedTarget {
  type: MatchedTargetType;
  /** targetId från known_targets eller null för unknown/needs_review. */
  targetId: string | null;
  label: string;
  /** Underliggande KnownTargetType när relevant. */
  knownTargetType: KnownTargetType | null;
}

export interface CandidateEvaluation {
  targetType: KnownTargetType;
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

export interface MatchClusterResult {
  matchedTarget: MatchedTarget;
  confidence: 'high' | 'medium' | 'low';
  candidates: CandidateEvaluation[];
  rejectedCandidates: CandidateEvaluation[];
  warnings: string[];
  decisionReason: string;
  /** True om assignment användes som tie-breaker (inte bara confidence-boost). */
  planningUsedAsTieBreaker: boolean;
  /** True om assignment pekade på target som GPS uteslöt geografiskt. */
  planningIgnoredBecauseGeoDisagreed: boolean;
}

export interface MatchClusterInput {
  cluster: StableLocationCluster;
  knownTargets: KnownTargetEvidenceItem[];
  assignments: AssignmentEvidenceItem[];
  /** True om staffen har ≥1 användbar private zone. */
  privateResidence: { hasUsableZone: boolean };
  /** Vidarebefordrat från evidence.knownTargets.dataQuality (ej muterat). */
  dataQuality?: unknown;
  options?: MatchOptions;
}

export interface MatchOptions {
  /** Default radie när target saknar egen radius. */
  defaultRadiusMeters?: number;
  /** Cluster-radie adderas som "fuzz" till target-radien. */
  useClusterRadiusFuzz?: boolean;
  /** Prioritetsordning (lägre = vinner). */
  priorities?: Record<KnownTargetType, number>;
}

// ── Geo helpers ───────────────────────────────────────────────────────────

const R_EARTH = 6371000;
const toRad = (x: number) => (x * Math.PI) / 180;

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_PRIORITY: Record<KnownTargetType, number> = {
  // Lägre = vinner. Supplier ligger mellan org_location och large_project:
  // känd fysisk plats men inte primär projektarbetsplats.
  private_zone: 1,
  home_observation: 1,
  inferred_home: 1,
  warehouse: 2,
  organization_location: 2,
  supplier: 3,
  large_project: 4,
  project: 5,
  booking: 6,
};

const DEFAULT_OPTIONS: Required<MatchOptions> = {
  defaultRadiusMeters: 100,
  useClusterRadiusFuzz: true,
  priorities: DEFAULT_PRIORITY,
};

// ── Helpers ───────────────────────────────────────────────────────────────

function assignmentSupportsTarget(
  target: KnownTargetEvidenceItem,
  assignments: AssignmentEvidenceItem[],
): boolean {
  if (!assignments.length) return false;
  return assignments.some((a) => {
    if (target.targetType === 'large_project') {
      return (
        a.largeProjectId === target.targetId ||
        // Child booking-assignment stöder LP.
        (a.belongsToLargeProject && a.bookingId !== null &&
          target.targetId !== null &&
          a.largeProjectId === target.targetId)
      );
    }
    if (target.targetType === 'booking') {
      return a.bookingId === target.targetId && !a.belongsToLargeProject;
    }
    if (target.targetType === 'project') {
      return a.projectId === target.targetId;
    }
    // warehouse / organization_location / private/home — assignment kan inte
    // direkt peka på dessa via ID; vi behandlar dem som ostödda.
    return false;
  });
}

function isPrivateType(t: KnownTargetType): boolean {
  return t === 'private_zone' || t === 'home_observation' || t === 'inferred_home';
}

// ── Main ──────────────────────────────────────────────────────────────────

export function matchClusterToKnownTarget(
  input: MatchClusterInput,
): MatchClusterResult {
  const opts: Required<MatchOptions> = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };
  const { cluster, knownTargets, assignments } = input;
  const warnings: string[] = [];
  const candidates: CandidateEvaluation[] = [];
  const rejected: CandidateEvaluation[] = [];

  // Eval varje target.
  for (const t of knownTargets) {
    if (!t.hasCoordinates || t.lat == null || t.lng == null) {
      // Saknar geo — kan inte matchas geografiskt.
      if (t.targetType === 'large_project' && t.suppressedReason !== 'cancelled') {
        // Track för diagnostics (LP utan egen geo).
        rejected.push({
          targetType: t.targetType,
          targetId: t.targetId,
          label: t.label,
          distanceMeters: Number.POSITIVE_INFINITY,
          effectiveRadiusMeters: 0,
          insideRadius: false,
          priority: opts.priorities[t.targetType] ?? 99,
          assignmentSupports: assignmentSupportsTarget(t, assignments),
          rejected: true,
          rejectReason: 'large_project_missing_geo',
        });
      }
      continue;
    }

    // Suppression från Lager 1.6 — child booking/project under LP, cancelled, m.fl.
    if (!t.canBePrimaryWorkTarget && !isPrivateType(t.targetType)) {
      rejected.push({
        targetType: t.targetType,
        targetId: t.targetId,
        label: t.label,
        distanceMeters: distanceMeters(cluster.centroidLat, cluster.centroidLng, t.lat, t.lng),
        effectiveRadiusMeters: t.radiusMeters ?? opts.defaultRadiusMeters,
        insideRadius: false,
        priority: opts.priorities[t.targetType] ?? 99,
        assignmentSupports: assignmentSupportsTarget(t, assignments),
        rejected: true,
        rejectReason: t.suppressedReason ?? 'not_eligible_as_primary_target',
      });
      continue;
    }

    const baseRadius = t.radiusMeters ?? opts.defaultRadiusMeters;
    const fuzz = opts.useClusterRadiusFuzz ? Math.min(cluster.radiusMeters, 150) : 0;
    const effectiveRadius = baseRadius + fuzz;
    const dist = distanceMeters(cluster.centroidLat, cluster.centroidLng, t.lat, t.lng);
    const inside = dist <= effectiveRadius;

    const cand: CandidateEvaluation = {
      targetType: t.targetType,
      targetId: t.targetId,
      label: t.label,
      distanceMeters: dist,
      effectiveRadiusMeters: effectiveRadius,
      insideRadius: inside,
      priority: opts.priorities[t.targetType] ?? 99,
      assignmentSupports: assignmentSupportsTarget(t, assignments),
      rejected: !inside,
      rejectReason: inside ? undefined : 'outside_radius',
    };
    if (inside) candidates.push(cand);
    else rejected.push(cand);
  }

  // Sortera vinnande kandidater: priority asc, sedan inside-distance asc.
  candidates.sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : a.distanceMeters - b.distanceMeters,
  );

  // Plocka primärt: första med lägsta priority. Tie-breaker bland samma priority:
  // assignment support → annars närmast distans.
  let planningUsedAsTieBreaker = false;
  let planningIgnoredBecauseGeoDisagreed = false;

  // Detect: assignment pekar på target som inte är inside (LP/project/booking).
  const assignmentTargetIds = new Set<string>();
  for (const a of assignments) {
    if (a.largeProjectId) assignmentTargetIds.add(`large_project:${a.largeProjectId}`);
    if (a.bookingId && !a.belongsToLargeProject) {
      assignmentTargetIds.add(`booking:${a.bookingId}`);
    }
    if (a.projectId) assignmentTargetIds.add(`project:${a.projectId}`);
  }
  for (const r of rejected) {
    const key = `${r.targetType}:${r.targetId}`;
    if (assignmentTargetIds.has(key)) {
      planningIgnoredBecauseGeoDisagreed = true;
      warnings.push(`planning_geo_mismatch:${r.targetType}:${r.targetId}`);
    }
  }

  let winner: CandidateEvaluation | null = null;
  let decisionReason = '';

  if (candidates.length > 0) {
    const topPriority = candidates[0].priority;
    const topGroup = candidates.filter((c) => c.priority === topPriority);
    if (topGroup.length === 1) {
      winner = topGroup[0];
      decisionReason = `single_candidate_priority_${topPriority}`;
    } else {
      const supported = topGroup.filter((c) => c.assignmentSupports);
      if (supported.length === 1) {
        winner = supported[0];
        planningUsedAsTieBreaker = true;
        decisionReason = `assignment_tiebreak_priority_${topPriority}`;
      } else if (supported.length > 1) {
        // Flera stödda → ta närmast.
        winner = supported.sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
        planningUsedAsTieBreaker = true;
        decisionReason = `assignment_tiebreak_then_nearest_priority_${topPriority}`;
      } else {
        winner = topGroup[0]; // redan sorterad på distans
        decisionReason = `nearest_in_priority_${topPriority}`;
      }
    }
  }

  // Mappning till MatchedTargetType.
  let matched: MatchedTarget;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (winner) {
    let mtype: MatchedTargetType;
    if (isPrivateType(winner.targetType)) mtype = 'private_residence';
    else if (winner.targetType === 'warehouse') mtype = 'warehouse';
    else if (winner.targetType === 'organization_location') mtype = 'organization_location';
    else if (winner.targetType === 'supplier') mtype = 'supplier';
    else if (winner.targetType === 'large_project') mtype = 'large_project';
    else if (winner.targetType === 'project') mtype = 'project';
    else mtype = 'booking';

    matched = {
      type: mtype,
      targetId: winner.targetId,
      label: winner.label,
      knownTargetType: winner.targetType,
    };

    // Confidence: cluster.confidence × geo + assignment-stöd.
    const inWell = winner.distanceMeters <= winner.effectiveRadiusMeters * 0.6;
    if (cluster.confidence === 'high' && inWell) confidence = 'high';
    else if (cluster.confidence === 'low') confidence = 'low';
    else confidence = 'medium';
    if (winner.assignmentSupports && confidence !== 'high') {
      confidence = confidence === 'low' ? 'medium' : 'high';
    }
  } else {
    // Inget inside-träff. Avgör om det ska bli needs_location_review.
    const lpAssignedButMissingGeo = rejected.some(
      (r) =>
        r.targetType === 'large_project' &&
        r.rejectReason === 'large_project_missing_geo' &&
        r.assignmentSupports,
    );
    if (lpAssignedButMissingGeo) {
      matched = {
        type: 'needs_location_review',
        targetId: null,
        label: 'Behöver platsgranskning',
        knownTargetType: null,
      };
      confidence = 'low';
      decisionReason = 'large_project_assigned_but_missing_own_geo';
      warnings.push('large_project_missing_own_geo_blocks_match');
    } else {
      matched = {
        type: 'no_eventflow_target_match',
        targetId: null,
        label: 'Ingen EventFlow-target',
        knownTargetType: null,
      };
      confidence = cluster.confidence === 'high' ? 'medium' : 'low';
      decisionReason = candidates.length === 0 && rejected.length === 0
        ? 'no_known_targets_in_range'
        : 'no_target_in_radius';
    }
  }

  // Suppress private_residence-vinst om vi inte har någon usable zone alls
  // (defensivt — privat ska ha riktig zone).
  if (matched.type === 'private_residence' && !input.privateResidence.hasUsableZone) {
    matched = {
      type: 'no_eventflow_target_match',
      targetId: null,
      label: 'Ingen EventFlow-target',
      knownTargetType: null,
    };
    confidence = 'low';
    warnings.push('private_match_dropped_no_usable_zone');
  }

  return {
    matchedTarget: matched,
    confidence,
    candidates,
    rejectedCandidates: rejected,
    warnings,
    decisionReason,
    planningUsedAsTieBreaker,
    planningIgnoredBecauseGeoDisagreed,
  };
}
