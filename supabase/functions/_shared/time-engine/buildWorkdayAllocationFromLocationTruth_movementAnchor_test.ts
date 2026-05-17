/**
 * Time Engine Movement Anchor Fix
 *
 * Screenshot-case: movement har GPS-rutt 12:05–14:33 men varken
 * fromTarget eller toTarget. Tidigare blev blocket "Behöver granskning".
 * Nu ska det renderas som Transport (work_travel) med varningen
 * `movement_missing_anchor`.
 *
 * Krav:
 *   1. Movement med routePingCount > 0 utan anchor → work_travel + warning
 *   2. Movement utan rutt OCH utan anchor → needs_work_allocation_review
 *   3. Movement med pingsBetween > 0 utan routePingCount → work_travel (route-evidence)
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
} from './buildLocationTruthFromDayEvidence.ts';

const ENVELOPE = {
  startAt: '2026-05-15T07:00:00.000Z',
  endAt: '2026-05-15T18:00:00.000Z',
  isOpen: false,
  startSource: 'active_time_registration' as const,
  endSource: 'active_time_registration_stop' as const,
  warnings: [],
};

function fakeLT(segments: LocationTruthSegment[]): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1', date: '2026-05-15', builtAtIso: '2026-05-15T00:00:00Z',
      buildDurationMs: 0, warnings: [],
    } as any,
  } as LocationTruthResult;
}

function movementWithRoute(opts: {
  id: string; start: string; end: string;
  distanceMeters: number;
  routePingCount?: number;
  pingsBetween?: number;
  fromPhysical?: { label: string; lat: number; lng: number };
  toPhysical?: { label: string; lat: number; lng: number };
}): LocationTruthSegment {
  const meta: Record<string, unknown> = {
    distanceMeters: opts.distanceMeters,
    routePingCount: opts.routePingCount ?? 0,
    pingsBetween: opts.pingsBetween ?? 0,
  };
  if (opts.fromPhysical) {
    meta.fromPhysicalLocation = { ...opts.fromPhysical, address: null };
    meta.fromLabel = opts.fromPhysical.label;
  }
  if (opts.toPhysical) {
    meta.toPhysicalLocation = { ...opts.toPhysical, address: null };
    meta.toLabel = opts.toPhysical.label;
  }
  return {
    id: opts.id, staffId: 'staff-1', startAt: opts.start, endAt: opts.end,
    type: 'movement', finalType: 'movement',
    confidence: 'medium',
    evidence: { pingCount: opts.pingsBetween ?? 0 } as any,
    warnings: [],
    diagnostics: { decisionReason: 'detected_true_movement', movementMeta: meta } as any,
    businessContext: { status: 'unresolved_business_context' },
  } as any;
}

function run(segments: LocationTruthSegment[]) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null,
    locationTruthV2: fakeLT(segments),
    workdayEnvelope: ENVELOPE,
  });
}

Deno.test('Movement Anchor — GPS-rutt utan anchor → Transport (work_travel) med varning', () => {
  // Screenshot-caset: 12:05–14:33, route-pings finns men ingen target på grannarna.
  const segs = [
    movementWithRoute({
      id: 'm1',
      start: '2026-05-15T12:05:00Z',
      end: '2026-05-15T14:33:00Z',
      distanceMeters: 25_000,
      routePingCount: 8,
      pingsBetween: 12,
      fromPhysical: { label: 'Westmans', lat: 59.32, lng: 18.07 },
      toPhysical: { label: 'Mottagaradress', lat: 59.45, lng: 17.93 },
    }),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel',
    'GPS-rutt utan anchor ska klassas som Transport/work_travel, inte review');
  assert(m.warnings.includes('movement_missing_anchor'),
    'Varningen movement_missing_anchor ska finnas kvar');
  assert(m.warnings.includes('movement_classified_as_work_travel'));
});

Deno.test('Movement Anchor — utan rutt OCH utan anchor → needs_work_allocation_review', () => {
  // Ingen route-evidence alls — då är det inte säkert att personen rört sig.
  const segs = [
    movementWithRoute({
      id: 'm1',
      start: '2026-05-15T12:05:00Z',
      end: '2026-05-15T14:33:00Z',
      distanceMeters: 25_000,
      routePingCount: 0,
      pingsBetween: 0,
    }),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'needs_work_allocation_review');
  assert(m.warnings.includes('movement_missing_anchor'));
});

Deno.test('Movement Anchor — pingsBetween > 0 räcker som GPS-rutt-evidence', () => {
  const segs = [
    movementWithRoute({
      id: 'm1',
      start: '2026-05-15T12:05:00Z',
      end: '2026-05-15T14:33:00Z',
      distanceMeters: 25_000,
      routePingCount: 0,
      pingsBetween: 5,
    }),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel');
});
