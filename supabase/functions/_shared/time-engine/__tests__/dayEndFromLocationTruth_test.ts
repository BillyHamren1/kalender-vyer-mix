import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideDayEndFromLocationTruth,
  PRIVATE_RESIDENCE_DAY_END_MINUTES,
  COMMUTE_DISTANCE_THRESHOLD_METERS,
} from '../dayEndFromLocationTruth.ts';
import type { LocationTruthSegment } from '../buildLocationTruthTimeline.ts';

function seg(p: Partial<LocationTruthSegment> & { id: string; startAt: string; endAt: string; kind: LocationTruthSegment['kind']; label: string }): LocationTruthSegment {
  return {
    targetId: null, targetType: null, locationId: null, projectId: null, bookingId: null,
    largeProjectId: null, assignmentId: null,
    centerLat: null, centerLng: null,
    confidence: 0.9, confidenceReasons: [], sourcePingIds: [],
    distanceToTargetMeters: null, insidePolygon: null, withinTolerance: false,
    signalGapMinutes: 0, signalGapCount: 0, signalQuality: 'good', warningReasons: [],
    rawEvidence: { pingCount: 1, matchReason: null, matchedByTolerance: false },
    ...p,
  } as LocationTruthSegment;
}

const STO_DAY = { startUtc: '2025-01-01T00:00:00Z', endUtc: '2025-01-01T23:59:59Z' };

Deno.test('dayEnd: manual stop wins', () => {
  const r = decideDayEndFromLocationTruth({
    date: '2025-01-01', staffId: 's1', stockholmDayWindow: STO_DAY,
    locationTruthSegments: [], isHistorical: false,
    manualStopAt: '2025-01-01T17:00:00Z',
  });
  assertEquals(r.decision.reason, 'manual_stop');
  assertEquals(r.decision.dayEndAt, '2025-01-01T17:00:00Z');
});

Deno.test('dayEnd: short commute residence after work confirms dayEnd at lastWorkEnd', () => {
  const segs = [
    seg({ id: 'w', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T16:00:00Z',
      kind: 'project', label: 'A', centerLat: 59.3293, centerLng: 18.0686 }),
    seg({ id: 'h', startAt: '2025-01-01T16:30:00Z', endAt: '2025-01-01T22:00:00Z',
      kind: 'private_residence', label: 'Hem', centerLat: 59.3320, centerLng: 18.0700 }),
  ];
  const r = decideDayEndFromLocationTruth({
    date: '2025-01-01', staffId: 's1', stockholmDayWindow: STO_DAY,
    locationTruthSegments: segs, isHistorical: false,
  });
  assertEquals(r.decision.reason, 'private_residence_confirmed');
  assertEquals(r.decision.longCommute, false);
  assertEquals(r.decision.dayEndAt, '2025-01-01T16:00:00Z');
  assert((r.decision.commuteDistanceMeters ?? 0) < COMMUTE_DISTANCE_THRESHOLD_METERS);
});

Deno.test('dayEnd: long commute (>150 km) sets dayEnd at residence enter', () => {
  const segs = [
    seg({ id: 'w', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T16:00:00Z',
      kind: 'project', label: 'A', centerLat: 59.3293, centerLng: 18.0686 }),
    // ~ 460 km away (Göteborg)
    seg({ id: 'h', startAt: '2025-01-01T19:00:00Z', endAt: '2025-01-01T23:00:00Z',
      kind: 'private_residence', label: 'Hem', centerLat: 57.7089, centerLng: 11.9746 }),
  ];
  const r = decideDayEndFromLocationTruth({
    date: '2025-01-01', staffId: 's1', stockholmDayWindow: STO_DAY,
    locationTruthSegments: segs, isHistorical: false,
  });
  assertEquals(r.decision.longCommute, true);
  assertEquals(r.decision.dayEndAt, '2025-01-01T19:00:00Z');
});

Deno.test('dayEnd: residence stay < 90 min does not confirm', () => {
  const segs = [
    seg({ id: 'w', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T16:00:00Z',
      kind: 'project', label: 'A', centerLat: 59.3293, centerLng: 18.0686 }),
    seg({ id: 'h', startAt: '2025-01-01T16:30:00Z', endAt: '2025-01-01T17:00:00Z',
      kind: 'private_residence', label: 'Hem', centerLat: 59.3320, centerLng: 18.0700 }),
  ];
  const r = decideDayEndFromLocationTruth({
    date: '2025-01-01', staffId: 's1', stockholmDayWindow: STO_DAY,
    locationTruthSegments: segs, isHistorical: false,
    lastGpsPingAt: '2025-01-01T17:00:00Z',
  });
  // Inte residence_confirmed eftersom < 90 min och färska pings finns
  assert(r.decision.reason !== 'private_residence_confirmed');
});

Deno.test('dayEnd: historical day always closes, never ongoing', () => {
  const segs = [
    seg({ id: 'w', startAt: '2025-01-01T08:00:00Z', endAt: '2025-01-01T16:00:00Z',
      kind: 'project', label: 'A', centerLat: 59.3, centerLng: 18.0 }),
  ];
  const r = decideDayEndFromLocationTruth({
    date: '2025-01-01', staffId: 's1', stockholmDayWindow: STO_DAY,
    locationTruthSegments: segs, isHistorical: true,
    lastGpsPingAt: '2025-01-01T16:01:00Z',
  });
  assert(r.decision.dayEndAt !== null);
});

Deno.test('dayEnd: open active timer without place evidence does NOT keep day alive', () => {
  const r = decideDayEndFromLocationTruth({
    date: '2025-01-01', staffId: 's1', stockholmDayWindow: STO_DAY,
    locationTruthSegments: [],
    isHistorical: false,
    activeTimer: { startedAt: '2025-01-01T08:00:00Z', stoppedAt: null, status: 'active' },
  });
  assertEquals(r.decision.reason, 'open_active_timer_ignored_no_evidence');
  assertEquals(r.decision.dayEndAt, null);
  assertEquals(r.diagnostics.staleOpenTimersIgnored, 1);
});

assertEquals(PRIVATE_RESIDENCE_DAY_END_MINUTES, 90);
assertEquals(COMMUTE_DISTANCE_THRESHOLD_METERS, 150_000);
