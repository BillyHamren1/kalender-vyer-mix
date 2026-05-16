// Time Engine Core Fix 2.1 — businessContextResolution → effective target på WorkdayAllocationSegment.
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

// Anchor-seg: redan matchad mot project som primärt work-target. Säkrar att
// STOP1 inte clampar wdEnd. Vi placerar den i slutet av dagen.
function anchorWorkSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'known_site', finalType: 'known_site', confidence: 'high',
    evidence: { pingCount: 50, centroidLat: 59.31, centroidLng: 18.01, assignmentSupportsTarget: true,
                distanceToTargetMeters: 10 },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'centroid', label: 'Anchor' },
    matchedTarget: { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt' },
    businessContext: { status: 'matched_eventflow_target',
                       matchedTarget: { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt' } },
  } as any;
}

function knownAddressSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'known_address', finalType: 'known_address', confidence: 'high',
    evidence: { pingCount: 50, centroidLat: 59.3, centroidLng: 18.0, assignmentSupportsTarget: false },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'centroid', label: 'Plats vid 59.3, 18.0' },
    businessContext: { status: 'unresolved_business_context' },
  } as any;
}

function warehouseMatchedSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'known_site', finalType: 'known_site', confidence: 'high',
    evidence: { pingCount: 50, centroidLat: 59.4, centroidLng: 18.0, assignmentSupportsTarget: false,
                distanceToTargetMeters: 5 },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'centroid', label: 'Lager' },
    matchedTarget: { targetType: 'warehouse', targetId: 'wh-1', label: 'Huvudlager' },
    businessContext: { status: 'matched_eventflow_target',
                       matchedTarget: { targetType: 'warehouse', targetId: 'wh-1', label: 'Huvudlager' } },
  } as any;
}

Deno.test('Core Fix 2.1 — A: known_address + booking-assignment utan geo → effective target = booking + label från bcr', () => {
  const target = knownAddressSeg('cluster_a', `${DAY}T08:00:00Z`, `${DAY}T12:00:00Z`);
  const anchor = anchorWorkSeg('anchor', `${DAY}T16:00:00Z`, `${DAY}T17:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 100, locationLogicPingCount: 100 },
      assignments: { items: [{
        source: 'booking_staff_assignment', assignmentId: 'a1', staffId: 's1',
        teamId: null, teamName: null,
        bookingId: 'b-77', projectId: null, largeProjectId: null,
        title: 'Handelsbanken 2026', plannedPhase: 'event',
        startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
        overlapsDate: true, overlapsTimeWindow: true,
        belongsToLargeProject: false, childBookingId: null,
      }] },
      knownTargets: { items: [
        { targetType: 'booking', targetId: 'b-77', label: 'Handelsbanken 2026',
          hasCoordinates: false, lat: null, lng: null, radiusMeters: null,
          canBePrimaryWorkTarget: true, suppressedReason: null },
        { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt',
          hasCoordinates: true, lat: 59.31, lng: 18.01, radiusMeters: 100,
          canBePrimaryWorkTarget: true, suppressedReason: null },
      ] },
    } as any,
    locationTruthV2: { segments: [target, anchor], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });

  const it = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('cluster_a'));
  assert(it, 'segment cluster_a saknas');
  assertEquals(it!.allocationType, 'booking_work');
  assertEquals(it!.targetType, 'booking');
  assertEquals(it!.targetId, 'b-77');
  assertEquals(it!.label, 'Handelsbanken 2026');
  assertEquals(it!.physicalLocationLabel, 'Plats vid 59.3, 18.0', 'physicalLocationLabel ska finnas kvar i metadata');
  assertEquals(it!.businessContextResolution?.fallbackUsed, 'assignment_without_geo');

  // DisplayTimeline härleder titel från label. Vi verifierar via deriveTitle
  // genom att kontrollera att label är rätt — själva titel-strängen byggs i
  // buildDisplayTimeline från (displayType='booking_work', label='Handelsbanken 2026')
  // → 'Bokning — Handelsbanken 2026' (täckt av separata displayTimeline-tester).
  assertEquals(it!.label, 'Handelsbanken 2026');
});

Deno.test('Core Fix 2.1 — B: known_address + project-assignment utan geo → effective target = project + label', () => {
  const target = knownAddressSeg('cluster_b', `${DAY}T09:00:00Z`, `${DAY}T11:00:00Z`);
  const anchor = anchorWorkSeg('anchor', `${DAY}T16:00:00Z`, `${DAY}T17:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 100, locationLogicPingCount: 100 },
      assignments: { items: [{
        source: 'staff_team_calendar_event', assignmentId: 'a1', staffId: 's1',
        teamId: 't3', teamName: 'Team 3',
        bookingId: null, projectId: 'p-42', largeProjectId: null,
        title: 'Projekt Alfa', plannedPhase: 'event',
        startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
        overlapsDate: true, overlapsTimeWindow: true,
        belongsToLargeProject: false, childBookingId: null,
      }] },
      knownTargets: { items: [
        { targetType: 'project', targetId: 'p-42', label: 'Projekt Alfa',
          hasCoordinates: false, lat: null, lng: null, radiusMeters: null,
          canBePrimaryWorkTarget: true, suppressedReason: null },
        { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt',
          hasCoordinates: true, lat: 59.31, lng: 18.01, radiusMeters: 100,
          canBePrimaryWorkTarget: true, suppressedReason: null },
      ] },
    } as any,
    locationTruthV2: { segments: [target, anchor], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  const it = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('cluster_b'));
  assert(it, 'cluster_b saknas');
  assertEquals(it!.allocationType, 'project_work');
  assertEquals(it!.targetType, 'project');
  assertEquals(it!.targetId, 'p-42');
  assertEquals(it!.label, 'Projekt Alfa');
  assertEquals(it!.assignmentStatus, 'assigned');
});

Deno.test('Core Fix 2.1 — C: known_address utan assignment → unlinked + label = fysisk plats (Plats vid lat,lng)', () => {
  const target = knownAddressSeg('cluster_c', `${DAY}T09:00:00Z`, `${DAY}T11:00:00Z`);
  const anchor = anchorWorkSeg('anchor', `${DAY}T16:00:00Z`, `${DAY}T17:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 100, locationLogicPingCount: 100 },
      assignments: { items: [] },
      knownTargets: { items: [
        { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt',
          hasCoordinates: true, lat: 59.31, lng: 18.01, radiusMeters: 100,
          canBePrimaryWorkTarget: true, suppressedReason: null },
      ] },
    } as any,
    locationTruthV2: { segments: [target, anchor], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  const it = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('cluster_c'));
  assert(it, 'cluster_c saknas');
  assertEquals(it!.allocationType, 'unlinked_work_address');
  assertEquals(it!.targetType, null);
  // label faller tillbaka på fysisk plats (där "Plats vid 59.3, 18.0" är OK).
  assertEquals(it!.label, 'Plats vid 59.3, 18.0');
});

Deno.test('Core Fix 2.1 — D: warehouse redan matchad i Lager 2 → behåller target oavsett bcr', () => {
  const seg = warehouseMatchedSeg('wh_seg', `${DAY}T10:00:00Z`, `${DAY}T12:00:00Z`);
  const anchor = anchorWorkSeg('anchor', `${DAY}T16:00:00Z`, `${DAY}T17:00:00Z`);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 100, locationLogicPingCount: 100 },
      assignments: { items: [] },
      knownTargets: { items: [
        { targetType: 'warehouse', targetId: 'wh-1', label: 'Huvudlager',
          hasCoordinates: true, lat: 59.4, lng: 18.0, radiusMeters: 50,
          canBePrimaryWorkTarget: true, suppressedReason: null },
        { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt',
          hasCoordinates: true, lat: 59.31, lng: 18.01, radiusMeters: 100,
          canBePrimaryWorkTarget: true, suppressedReason: null },
      ] },
    } as any,
    locationTruthV2: { segments: [seg, anchor], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  const it = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('wh_seg'));
  assert(it, 'wh_seg saknas');
  assertEquals(it!.allocationType, 'warehouse_work');
  assertEquals(it!.targetType, 'warehouse');
  assertEquals(it!.targetId, 'wh-1');
  assertEquals(it!.label, 'Huvudlager');
  assertEquals(it!.assignmentStatus, 'no_assignment_required');
});
