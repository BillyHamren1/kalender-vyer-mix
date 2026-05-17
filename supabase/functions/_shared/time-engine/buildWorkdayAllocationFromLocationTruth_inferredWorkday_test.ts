// Time Engine Core Fix — Inferred Workday rendering test.
// Säkerställer att om dagtimer SAKNAS men LocationTruth visar tydlig
// arbetsplats (project/booking/large_project/warehouse/organization_location/supplier),
// så skapas en read-only inferred workday envelope och allocation-segment
// renderas som arbetsblock (project_work etc.) — inte som "förslag" och
// inte med no_active_workday-stopp.
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  buildWorkdayAllocationFromLocationTruth,
  type WorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';

const DAY = '2026-05-16';

// Öppen envelope utan timer (motsvarar "ingen active_time_registration").
function noTimerEnvelope(): WorkdayEnvelope {
  return {
    startAt: null,
    endAt: null,
    isOpen: false,
    startSource: 'no_active_workday',
    endSource: 'no_active_workday',
    warnings: ['no_active_workday'],
    timerStartedAt: null,
    timerStoppedAt: null,
    effectiveWorkdayStartAt: null,
    effectiveWorkdayEndAt: null,
    analysisDayStartAt: `${DAY}T00:00:00.000Z`,
    analysisDayEndAt: `${DAY}T23:59:59.999Z`,
    startWasClippedToDay: false,
    endWasClippedToDay: false,
    endWasClippedToNow: false,
  } as any;
}

function projectMatchedSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'known_site', finalType: 'known_site', confidence: 'high',
    evidence: {
      pingCount: 50,
      centroidLat: 59.31, centroidLng: 18.01,
      assignmentSupportsTarget: true,
      distanceToTargetMeters: 10,
    },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'centroid', label: 'Westmans' },
    targetType: 'project', targetId: 'p-west', // för INFERRED_WORK_TARGETS-filter
    matchedTarget: { targetType: 'project', targetId: 'p-west', label: 'Westmans' },
    businessContext: {
      status: 'matched_eventflow_target',
      matchedTarget: { targetType: 'project', targetId: 'p-west', label: 'Westmans' },
    },
  } as any;
}

function privateResidenceSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'private_residence', finalType: 'private_residence', confidence: 'high',
    evidence: { pingCount: 30, centroidLat: 59.40, centroidLng: 18.10, assignmentSupportsTarget: false },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'private_zone', label: 'Hemma' },
    targetType: 'private_residence', // får ej skapa workday
    businessContext: { status: 'private_residence' },
  } as any;
}

function unknownSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'unresolved', finalType: 'unresolved', confidence: 'low',
    evidence: { pingCount: 5, centroidLat: 59.0, centroidLng: 18.0, assignmentSupportsTarget: false },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: null,
    targetType: null,
    businessContext: { status: 'unresolved_business_context' },
  } as any;
}

Deno.test('Inferred Workday A — Billy/Westmans: ingen timer men project-match → inferred envelope + project_work', () => {
  const seg = projectMatchedSeg('s-1', `${DAY}T08:00:00Z`, `${DAY}T15:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 50, locationLogicPingCount: 50 },
      assignments: { items: [{
        source: 'staff_team_calendar_event', assignmentId: 'a1', staffId: 's1',
        teamId: 't1', teamName: 'T1',
        bookingId: null, projectId: 'p-west', largeProjectId: null,
        title: 'Westmans', plannedPhase: 'event',
        startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
        overlapsDate: true, overlapsTimeWindow: true,
        belongsToLargeProject: false, childBookingId: null,
      }] },
      knownTargets: { items: [{
        targetType: 'project', targetId: 'p-west', label: 'Westmans',
        hasCoordinates: true, lat: 59.31, lng: 18.01, radiusMeters: 100,
        canBePrimaryWorkTarget: true, suppressedReason: null,
      }] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: noTimerEnvelope(),
  });

  // Inferred envelope skapad
  assertEquals(r.diagnostics.inferredWorkdayFromLocationTruth, true);
  assertEquals((r.diagnostics as any).inferredWorkdayWritesToDb, false);
  assertEquals(r.diagnostics.workdayStartSource, 'inferred_from_location_truth');
  assertEquals(r.diagnostics.workdayEndSource, 'inferred_from_location_truth');
  assertEquals(r.diagnostics.hasActiveWorkday, true);
  assertEquals(r.diagnostics.workdayEnvelopeFound, true);

  // Block renderas som arbetsblock (project_work) — inte outside, inte review
  assertEquals(r.segments.length, 1);
  const it = r.segments[0];
  assertEquals(it.allocationType, 'project_work');
  assert(!it.outsideWorkday, 'segment ska vara inne i inferred workday');
  assert(!it.warnings.includes('segment_outside_workday'));
});

Deno.test('Inferred Workday B — Private residence ensam: ingen inferred workday, inga arbetsblock', () => {
  const seg = privateResidenceSeg('s-2', `${DAY}T09:00:00Z`, `${DAY}T17:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 30, locationLogicPingCount: 30 },
      assignments: { items: [] },
      knownTargets: { items: [] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: noTimerEnvelope(),
  });

  assertEquals(r.diagnostics.inferredWorkdayFromLocationTruth ?? false, false);
  assertEquals(r.diagnostics.hasActiveWorkday, false);
  // Ingen workday → ingen arbetsallokering
  const workSegs = r.segments.filter((s) =>
    ['project_work', 'large_project_work', 'booking_work', 'warehouse_work', 'supplier_visit']
      .includes(s.allocationType),
  );
  assertEquals(workSegs.length, 0);
});

Deno.test('Inferred Workday C — Endast okänd plats: ingen inferred workday, inga arbetsblock', () => {
  const seg = unknownSeg('s-3', `${DAY}T08:00:00Z`, `${DAY}T14:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 5, locationLogicPingCount: 5 },
      assignments: { items: [] },
      knownTargets: { items: [] },
    } as any,
    locationTruthV2: { segments: [seg], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: noTimerEnvelope(),
  });

  assertEquals(r.diagnostics.inferredWorkdayFromLocationTruth ?? false, false);
  assertEquals(r.diagnostics.hasActiveWorkday, false);
});
