// Time Engine Core Fix 2 — Business context resolution före unlinked_address.
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  buildWorkdayAllocationFromLocationTruth,
  type WorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';

const DAY = '2026-05-16';

function envelope(start: string, stop: string): WorkdayEnvelope {
  return {
    startAt: start, endAt: stop, isOpen: false,
    startSource: 'active_time_registration',
    endSource: 'active_time_registration_stop',
    warnings: [],
    timerStartedAt: start, timerStoppedAt: stop,
    effectiveWorkdayStartAt: start, effectiveWorkdayEndAt: stop,
    analysisDayStartAt: `${DAY}T00:00:00.000Z`, analysisDayEndAt: `${DAY}T23:59:59.999Z`,
    startWasClippedToDay: false, endWasClippedToDay: false, endWasClippedToNow: false,
  };
}

function knownAddressSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'known_address', finalType: 'known_address',
    confidence: 'high',
    evidence: { pingCount: 50, centroidLat: 59.3, centroidLng: 18.0, assignmentSupportsTarget: false },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'centroid', label: 'Test Adress' },
    businessContext: { status: 'unresolved_business_context' },
  } as any;
}

Deno.test('Core Fix 2 — A: known_address + overlappande project-assignment utan geo → project_work + target_missing_geo', () => {
  const seg = knownAddressSeg('cluster_a', `${DAY}T08:00:00Z`, `${DAY}T12:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 50, locationLogicPingCount: 50 },
      assignments: { items: [{
        source: 'staff_team_calendar_event', assignmentId: 'a1', staffId: 's1',
        teamId: 't3', teamName: 'Team 3',
        bookingId: null, projectId: 'p-1', largeProjectId: null,
        title: 'Projekt X', plannedPhase: 'event',
        startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
        overlapsDate: true, overlapsTimeWindow: true,
        belongsToLargeProject: false, childBookingId: null,
      }] },
      knownTargets: { items: [{
        targetType: 'project', targetId: 'p-1', label: 'Projekt X',
        hasCoordinates: false, lat: null, lng: null, radiusMeters: null,
        canBePrimaryWorkTarget: true, suppressedReason: null,
      }] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });

  assertEquals(r.segments.length, 1);
  const it = r.segments[0];
  assertEquals(it.allocationType, 'project_work');
  assert(it.warnings.includes('target_missing_geo'));
  assert(it.warnings.includes('business_context_from_assignment'));
  assertEquals(it.businessContextResolution?.fallbackUsed, 'assignment_without_geo');
  assertEquals(it.businessContextResolution?.selectedTargetType, 'project');
  assert((r.diagnostics.businessContextFromAssignmentCount ?? 0) >= 1);
});

Deno.test('Core Fix 2 — B: large_project vinner över child booking', () => {
  const seg = knownAddressSeg('cluster_b', `${DAY}T08:00:00Z`, `${DAY}T12:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 10, locationLogicPingCount: 10 },
      assignments: { items: [{
        source: 'booking_staff_assignment', assignmentId: 'a1', staffId: 's1',
        teamId: null, teamName: null,
        bookingId: 'b-1', projectId: null, largeProjectId: 'lp-1',
        title: 'Child', plannedPhase: 'event',
        startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
        overlapsDate: true, overlapsTimeWindow: true,
        belongsToLargeProject: true, childBookingId: 'b-1',
      }] },
      knownTargets: { items: [] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  const it = r.segments[0];
  assertEquals(it.allocationType, 'large_project_work');
  assertEquals(it.businessContextResolution?.selectedTargetType, 'large_project');
});

Deno.test('Core Fix 2 — C: ingen assignment, ingen target → unlinked_work_address (warning, ej review)', () => {
  const seg = knownAddressSeg('cluster_c', `${DAY}T08:00:00Z`, `${DAY}T12:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 10, locationLogicPingCount: 10 },
      assignments: { items: [] },
      knownTargets: { items: [] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  const it = r.segments[0];
  assertEquals(it.allocationType, 'unlinked_work_address');
  assertEquals(it.businessContextResolution?.fallbackUsed, 'stable_address_no_target');
  assert(it.warnings.includes('no_project_link'));
  assert((r.diagnostics.stableAddressNoTargetCount ?? 0) >= 1);
});

Deno.test('Core Fix 2 — D: konkurrerande projekt-assignments (utan LP) → needs_review + competing_targets', () => {
  const seg = knownAddressSeg('cluster_d', `${DAY}T08:00:00Z`, `${DAY}T12:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 10, locationLogicPingCount: 10 },
      assignments: { items: [
        { source: 'staff_team_calendar_event', assignmentId: 'a1', staffId: 's1',
          teamId: 't1', teamName: 'T1', bookingId: null, projectId: 'p-A',
          largeProjectId: null, title: 'A', plannedPhase: 'event',
          startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
          overlapsDate: true, overlapsTimeWindow: true,
          belongsToLargeProject: false, childBookingId: null },
        { source: 'staff_team_calendar_event', assignmentId: 'a2', staffId: 's1',
          teamId: 't2', teamName: 'T2', bookingId: null, projectId: 'p-B',
          largeProjectId: null, title: 'B', plannedPhase: 'event',
          startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
          overlapsDate: true, overlapsTimeWindow: true,
          belongsToLargeProject: false, childBookingId: null },
      ] },
      knownTargets: { items: [] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  const it = r.segments[0];
  assertEquals(it.allocationType, 'needs_work_allocation_review');
  assert(it.warnings.includes('competing_targets'));
  assertEquals(it.businessContextResolution?.competingTargets, true);
});
