// Time Engine Core Stabilization — kedjan från LocationTruth till DisplayTimeline.
// Täcker DEL 3 (effective target → titel), DEL 4 (outsideWorkday suppression),
// DEL 6 (title vs physical location), DEL 5 (gap-tolerans efter day end).
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  buildWorkdayAllocationFromLocationTruth,
  type WorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import { buildDisplayTimelineFromWorkdayAllocation } from './buildDisplayTimelineFromWorkdayAllocation.ts';

const DAY = '2026-05-17';

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

function anchorWorkSeg(id: string, startAt: string, endAt: string) {
  return {
    id, staffId: 's1', startAt, endAt,
    type: 'known_site', finalType: 'known_site', confidence: 'high',
    evidence: {
      pingCount: 50, centroidLat: 59.31, centroidLng: 18.01,
      assignmentSupportsTarget: true, distanceToTargetMeters: 10,
    },
    warnings: [],
    diagnostics: { sourcePingIds: [`p_${id}`] },
    physicalLocation: { source: 'centroid', label: 'Anchor' },
    matchedTarget: { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt' },
    businessContext: {
      status: 'matched_eventflow_target',
      matchedTarget: { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt' },
    },
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

Deno.test('Stabilization D — booking_work titel använder BCR-label, inte fysisk plats', () => {
  const target = knownAddressSeg('seg_d', `${DAY}T08:00:00Z`, `${DAY}T12:00:00Z`);
  const anchor = anchorWorkSeg('anchor', `${DAY}T16:00:00Z`, `${DAY}T17:00:00Z`);
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 100, locationLogicPingCount: 100 },
      assignments: { items: [{
        source: 'booking_staff_assignment', assignmentId: 'a1', staffId: 's1',
        teamId: null, teamName: null,
        bookingId: 'b-99', projectId: null, largeProjectId: null,
        title: 'Handelsbanken', plannedPhase: 'event',
        startAt: `${DAY}T07:00:00Z`, endAt: `${DAY}T17:00:00Z`,
        overlapsDate: true, overlapsTimeWindow: true,
        belongsToLargeProject: false, childBookingId: null,
      }] },
      knownTargets: { items: [
        { targetType: 'booking', targetId: 'b-99', label: 'Handelsbanken',
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
  const dt = buildDisplayTimelineFromWorkdayAllocation({
    workdayAllocation: wda,
  } as any);
  const block = dt.blocks.find((b) => b.displayType === 'booking');
  assert(block, 'booking-block saknas i DisplayTimeline');
  // DEL 6 — titel ska härledas från BCR-label, inte "Plats vid lat,lng".
  assertEquals(block!.title, 'Bokning — Handelsbanken');
  // DEL 6 — fysisk plats finns kvar separat i metadata.
  assertEquals((block!.metadata as any).physicalLocationLabel, 'Plats vid 59.3, 18.0');
});

Deno.test('Stabilization E — outsideWorkday-segment renderas inte i DisplayTimeline', () => {
  // Segment helt utanför envelopen (efter day end) → outsideWorkday=true.
  const outside = knownAddressSeg('seg_outside', `${DAY}T22:00:00Z`, `${DAY}T23:30:00Z`);
  const inside = anchorWorkSeg('anchor', `${DAY}T09:00:00Z`, `${DAY}T16:00:00Z`);
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 100, locationLogicPingCount: 100 },
      assignments: { items: [] },
      knownTargets: { items: [
        { targetType: 'project', targetId: 'anchor-p', label: 'Anchor projekt',
          hasCoordinates: true, lat: 59.31, lng: 18.01, radiusMeters: 100,
          canBePrimaryWorkTarget: true, suppressedReason: null },
      ] },
    } as any,
    locationTruthV2: { segments: [inside, outside], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  // outsideWorkday-segmentet ska finnas i allocation (för audit) men markerat.
  const outSeg = wda.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('seg_outside'));
  assert(outSeg, 'outside-seg ska finnas i allocation');
  assertEquals((outSeg as any).outsideWorkday, true);

  const dt = buildDisplayTimelineFromWorkdayAllocation({ workdayAllocation: wda } as any);
  // INGET block i DisplayTimeline för outsideWorkday-segmentet.
  const outsideBlock = dt.blocks.find((b) =>
    b.sourceAllocationSegmentIds.includes(outSeg!.id),
  );
  assert(!outsideBlock, 'outsideWorkday får inte rendera DisplayTimeline-block');
  // Diagnostics ska räkna suppressionen.
  assertEquals((dt.diagnostics as any).outsideWorkdaySegmentsSuppressedCount, 1);
  assert((dt.diagnostics as any).outsideWorkdayMinutesSuppressed > 0);
});

Deno.test('Stabilization A — engineBlockedBecauseLocationTruthMissing → DisplayTimeline tom + suppress-warning', () => {
  // Inga LT-segment men raw pings finns → motorn ska blockera.
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: {
      gps: { rawPingCount: 50, locationLogicPingCount: 50 },
      assignments: { items: [] },
      knownTargets: { items: [] },
    } as any,
    locationTruthV2: { segments: [], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope(`${DAY}T08:00:00Z`, `${DAY}T17:00:00Z`),
  });
  assertEquals((wda.diagnostics as any).engineBlockedBecauseLocationTruthMissing, true);
  assertEquals((wda.diagnostics as any).hasRawPingsButNoLocationTruth, true);

  const dt = buildDisplayTimelineFromWorkdayAllocation({ workdayAllocation: wda } as any);
  assertEquals(dt.blocks.length, 0);
  assert(
    (dt.diagnostics.warnings as any[]).includes('display_suppressed_because_missing_location_truth'),
    'DisplayTimeline ska markera suppression',
  );
});
