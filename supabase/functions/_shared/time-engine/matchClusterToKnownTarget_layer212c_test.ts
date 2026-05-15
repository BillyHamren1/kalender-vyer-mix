/**
 * Lager 2.12C — match-helpern returnerar no_eventflow_target_match (inte
 * needs_location_review) när LP saknar egen geo men klustret är stabilt.
 * needs_location_review reserveras för verkliga konflikter (impossible route,
 * konkurrerande targets, home/project-konflikt).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { matchClusterToKnownTarget } from './matchClusterToKnownTarget.ts';

function cluster(lat = 59.4, lng = 17.9): any {
  return {
    id: 'c1',
    centroidLat: lat,
    centroidLng: lng,
    radiusMeters: 30,
    pingCount: 12,
    isStable: true,
    confidence: 'high',
    startAt: '2026-05-15T09:00:00Z',
    endAt: '2026-05-15T10:00:00Z',
    sourcePingIds: [],
  };
}

function lpNoGeo(): any {
  return {
    targetType: 'large_project', targetId: 'lp1', label: 'LP',
    lat: null, lng: null, radiusMeters: null,
    hasCoordinates: false, hasRadius: false,
    canBePrimaryWorkTarget: true, canBeGeoTarget: false,
    suppressedReason: null, parentLargeProjectId: null,
    belongsToLargeProject: false, sourceTable: 'large_projects',
  };
}

function childBooking(lat: number, lng: number): any {
  return {
    targetType: 'booking', targetId: 'b-child', label: 'Child',
    lat, lng, radiusMeters: 80,
    hasCoordinates: true, hasRadius: true,
    canBePrimaryWorkTarget: false, canBeGeoTarget: false,
    suppressedReason: 'child_of_large_project',
    parentLargeProjectId: 'lp1', belongsToLargeProject: true,
    sourceTable: 'bookings',
  };
}

Deno.test('2.12C: LP utan geo (assigned) → no_eventflow_target_match med business warnings', () => {
  const r = matchClusterToKnownTarget({
    cluster: cluster(),
    knownTargets: [lpNoGeo()],
    assignments: [{ bookingId: null, projectId: null, largeProjectId: 'lp1', belongsToLargeProject: false } as any],
    privateResidence: { hasUsableZone: false },
  });
  assertEquals(r.matchedTarget.type, 'no_eventflow_target_match');
  assertEquals(
    r.decisionReason,
    'assigned_large_project_missing_geo_but_physical_location_stable',
  );
  assert(r.warnings.includes('assigned_large_project_missing_geo'));
  assert(r.warnings.includes('large_project_missing_geo'));
  assert(r.warnings.includes('business_target_missing_geo'));
});

Deno.test('2.12C: child booking blir aldrig fallback för LP utan geo', () => {
  const child = childBooking(59.4, 17.9);
  const r = matchClusterToKnownTarget({
    cluster: cluster(child.lat, child.lng),
    knownTargets: [lpNoGeo(), child],
    assignments: [{ bookingId: 'b-child', projectId: null, largeProjectId: 'lp1', belongsToLargeProject: true } as any],
    privateResidence: { hasUsableZone: false },
  });
  assert(r.matchedTarget.type !== 'booking', 'child must not win');
  assertEquals(r.matchedTarget.targetId, null);
  assertEquals(r.matchedTarget.type, 'no_eventflow_target_match');
});
