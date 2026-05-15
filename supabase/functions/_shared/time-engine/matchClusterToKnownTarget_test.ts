import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  matchClusterToKnownTarget,
  type MatchClusterInput,
} from './matchClusterToKnownTarget.ts';
import type { KnownTargetEvidenceItem, KnownTargetType } from './buildKnownTargetsEvidence.ts';
import type { AssignmentEvidenceItem } from './buildAssignmentEvidence.ts';
import type { StableLocationCluster } from './buildStableLocationClusters.ts';

function makeCluster(lat: number, lng: number, opts: Partial<StableLocationCluster> = {}): StableLocationCluster {
  return {
    id: 'c1',
    startAt: '2026-05-15T08:00:00Z',
    endAt: '2026-05-15T09:00:00Z',
    pingCount: 8,
    centroidLat: lat,
    centroidLng: lng,
    medianAccuracyMeters: 12,
    p90AccuracyMeters: 20,
    radiusMeters: 25,
    sourcePingIds: ['p1', 'p2'],
    confidence: 'high',
    maxInternalGapMinutes: 5,
    isStable: true,
    reasons: [],
    ...opts,
  };
}

function makeTarget(p: Partial<KnownTargetEvidenceItem> & {
  targetType: KnownTargetType; targetId: string; label: string;
  lat: number | null; lng: number | null;
}): KnownTargetEvidenceItem {
  const hasCoords = p.lat != null && p.lng != null;
  return {
    targetType: p.targetType,
    targetId: p.targetId,
    label: p.label,
    lat: p.lat,
    lng: p.lng,
    radiusMeters: p.radiusMeters ?? 100,
    polygon: null,
    hasCoordinates: hasCoords,
    hasRadius: p.radiusMeters != null,
    sourceTable: 'test',
    status: null,
    dateWindow: null,
    parentLargeProjectId: p.parentLargeProjectId ?? null,
    belongsToLargeProject: p.belongsToLargeProject ?? false,
    canBePrimaryWorkTarget: p.canBePrimaryWorkTarget ?? true,
    canBeGeoTarget: p.canBeGeoTarget ?? true,
    suppressedReason: p.suppressedReason ?? null,
  };
}

function makeAssignment(p: Partial<AssignmentEvidenceItem> & { staffId?: string } = {}): AssignmentEvidenceItem {
  return {
    source: 'staff_assignment' as any,
    assignmentId: p.assignmentId ?? 'a1',
    staffId: p.staffId ?? 's1',
    teamId: null,
    teamName: null,
    bookingId: p.bookingId ?? null,
    projectId: p.projectId ?? null,
    largeProjectId: p.largeProjectId ?? null,
    title: null,
    plannedPhase: 'event' as any,
    startAt: '2026-05-15T07:00:00Z',
    endAt: '2026-05-15T17:00:00Z',
    overlapsDate: true,
    overlapsTimeWindow: true,
    belongsToLargeProject: p.belongsToLargeProject ?? false,
    childBookingId: p.belongsToLargeProject ? (p.bookingId ?? null) : null,
  };
}

const PRIVATE = { hasUsableZone: true } as const;
const NO_PRIVATE = { hasUsableZone: false } as const;

// A. GPS inne på warehouse, planering pekar på annat → warehouse vinner.
Deno.test('A: warehouse wins over planned booking elsewhere', () => {
  const cluster = makeCluster(59.3293, 18.0686);
  const targets = [
    makeTarget({ targetType: 'warehouse', targetId: 'wh1', label: 'FA Warehouse', lat: 59.3293, lng: 18.0686, radiusMeters: 50 }),
    makeTarget({ targetType: 'booking', targetId: 'bk-kagge', label: 'Kaggeholm', lat: 59.40, lng: 17.90, radiusMeters: 50 }),
  ];
  const assignments = [makeAssignment({ bookingId: 'bk-kagge' })];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments, privateResidence: NO_PRIVATE });
  assertEquals(r.matchedTarget.type, 'warehouse');
  assertEquals(r.matchedTarget.targetId, 'wh1');
  assert(r.planningIgnoredBecauseGeoDisagreed);
  assert(r.warnings.some((w) => w.startsWith('planning_geo_mismatch')));
});

// B. GPS på large project (egen geo) → LP vinner.
Deno.test('B: large_project with own geo wins', () => {
  const cluster = makeCluster(59.40, 17.90);
  const targets = [
    makeTarget({ targetType: 'large_project', targetId: 'lp1', label: 'Kaggeholm LP', lat: 59.40, lng: 17.90, radiusMeters: 200 }),
  ];
  const assignments = [makeAssignment({ largeProjectId: 'lp1' })];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments, privateResidence: NO_PRIVATE });
  assertEquals(r.matchedTarget.type, 'large_project');
  assertEquals(r.confidence, 'high');
});

// C. GPS nära child booking inom LP → child får inte vinna.
Deno.test('C: child booking inside LP cannot win', () => {
  const cluster = makeCluster(59.40, 17.90);
  const targets = [
    // LP utan egen geo
    makeTarget({ targetType: 'large_project', targetId: 'lp1', label: 'LP', lat: null, lng: null, radiusMeters: null as unknown as number }),
    // Child booking har geo men suppressed
    makeTarget({
      targetType: 'booking', targetId: 'bk-child', label: 'Child', lat: 59.40, lng: 17.90,
      radiusMeters: 50, belongsToLargeProject: true, parentLargeProjectId: 'lp1',
      canBePrimaryWorkTarget: false, canBeGeoTarget: false,
      suppressedReason: 'child_booking_inside_large_project',
    }),
  ];
  const assignments = [makeAssignment({ bookingId: 'bk-child', largeProjectId: 'lp1', belongsToLargeProject: true })];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments, privateResidence: NO_PRIVATE });
  assert(r.matchedTarget.type !== 'booking', 'child booking must not win');
  assertEquals(r.matchedTarget.type, 'needs_location_review');
});

// D. Vanlig booking utan LP → booking kan vinna.
Deno.test('D: standalone booking can win', () => {
  const cluster = makeCluster(59.50, 18.00);
  const targets = [
    makeTarget({ targetType: 'booking', targetId: 'bk1', label: 'Standalone', lat: 59.50, lng: 18.00, radiusMeters: 60 }),
  ];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments: [], privateResidence: NO_PRIVATE });
  assertEquals(r.matchedTarget.type, 'booking');
  assertEquals(r.matchedTarget.targetId, 'bk1');
});

// E. Två fysiskt rimliga targets, assignment stöder ena → tie-break.
Deno.test('E: assignment tie-breaks two physically valid bookings', () => {
  const cluster = makeCluster(59.50, 18.00);
  const targets = [
    makeTarget({ targetType: 'booking', targetId: 'bk-a', label: 'A', lat: 59.5001, lng: 18.0001, radiusMeters: 200 }),
    makeTarget({ targetType: 'booking', targetId: 'bk-b', label: 'B', lat: 59.5002, lng: 18.0002, radiusMeters: 200 }),
  ];
  const assignments = [makeAssignment({ bookingId: 'bk-b' })];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments, privateResidence: NO_PRIVATE });
  assertEquals(r.matchedTarget.targetId, 'bk-b');
  assert(r.planningUsedAsTieBreaker);
});

// F. GPS långt från assignment → assignment får inte vinna.
Deno.test('F: GPS far from planned target → planning ignored', () => {
  const cluster = makeCluster(59.30, 18.07);
  const targets = [
    makeTarget({ targetType: 'booking', targetId: 'bk-far', label: 'Far', lat: 60.50, lng: 17.00, radiusMeters: 100 }),
  ];
  const assignments = [makeAssignment({ bookingId: 'bk-far' })];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments, privateResidence: NO_PRIVATE });
  assertEquals(r.matchedTarget.type, 'no_eventflow_target_match');
  assert(r.planningIgnoredBecauseGeoDisagreed);
});

// G. LP saknar egen geo → needs_location_review + warning.
Deno.test('G: large_project missing geo → needs_location_review', () => {
  const cluster = makeCluster(59.40, 17.90);
  const targets = [
    makeTarget({ targetType: 'large_project', targetId: 'lp1', label: 'LP no geo', lat: null, lng: null, radiusMeters: null as unknown as number }),
  ];
  const assignments = [makeAssignment({ largeProjectId: 'lp1' })];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments, privateResidence: NO_PRIVATE });
  assertEquals(r.matchedTarget.type, 'needs_location_review');
  assert(r.warnings.includes('large_project_missing_own_geo_blocks_match'));
});

// H. Private zone vinner över allt om inside.
Deno.test('H: private_zone wins over warehouse if both inside', () => {
  const cluster = makeCluster(59.20, 18.00);
  const targets = [
    makeTarget({ targetType: 'warehouse', targetId: 'wh', label: 'Warehouse', lat: 59.2001, lng: 18.0001, radiusMeters: 200 }),
    makeTarget({ targetType: 'private_zone', targetId: 'pz', label: 'Hem', lat: 59.20, lng: 18.00, radiusMeters: 150, canBePrimaryWorkTarget: false }),
  ];
  const r = matchClusterToKnownTarget({ cluster, knownTargets: targets, assignments: [], privateResidence: PRIVATE });
  assertEquals(r.matchedTarget.type, 'private_residence');
});
