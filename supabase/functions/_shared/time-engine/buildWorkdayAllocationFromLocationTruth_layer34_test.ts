/**
 * Lager 3.4 — Fördela movement från Lager 2.
 *
 * Verifierar att movement-segment får rätt arbetskontext:
 *   1. work→work (warehouse→project) → work_travel
 *   2. project→supplier → work_travel
 *   3. project A → project B → work_travel
 *   4. home → first work → commute_travel + normally_not_paid_commute
 *   5. last work → home → commute_travel + normally_not_paid_homebound
 *   6. distance > 150 km → long_travel_over_150km warning + paid_travel_possible-proposal
 *   7. movement utan tydlig anchor → needs_work_allocation_review + movement_missing_anchor
 *   8. Diagnostics-räknare: workTravelCount, commuteTravelCount,
 *      longTravelOver150kmCount, movementReviewCount.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  FinalLocationTruthSegmentType,
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

function siteSeg(id: string, start: string, end: string, t: LocationTruthTargetType): LocationTruthSegment {
  const matched = { targetType: t, targetId: `${t}-1`, label: `${t} A` };
  const finalType: FinalLocationTruthSegmentType =
    t === 'private_zone' ? 'private_residence' : 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: finalType === 'private_residence' ? 'private_residence' : 'known_target',
    finalType,
    confidence: 'high',
    physicalLocation: { label: matched.label, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status: 'matched_eventflow_target', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: true, pingCount: 5 } as any,
    warnings: [],
    diagnostics: {} as any,
  } as any;
}

function movementSeg(opts: {
  id: string; start: string; end: string;
  fromType?: LocationTruthTargetType | null;
  toType?: LocationTruthTargetType | null;
  distanceMeters?: number | null;
}): LocationTruthSegment {
  const meta: Record<string, unknown> = {};
  if (opts.fromType) meta.fromTarget = { targetType: opts.fromType, targetId: 'x', label: 'x' };
  if (opts.toType) meta.toTarget = { targetType: opts.toType, targetId: 'y', label: 'y' };
  if (typeof opts.distanceMeters === 'number') meta.distanceMeters = opts.distanceMeters;
  return {
    id: opts.id, staffId: 'staff-1', startAt: opts.start, endAt: opts.end,
    type: 'movement', finalType: 'movement',
    confidence: 'medium',
    evidence: { pingCount: 3 } as any,
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

Deno.test('Lager 3.4 — work→work movement = work_travel', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T07:30:00Z', '2026-05-15T08:00:00Z', 'warehouse'),
    movementSeg({ id: 'm1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T08:30:00Z',
      fromType: 'warehouse', toType: 'project', distanceMeters: 12_000 }),
    siteSeg('s2', '2026-05-15T08:30:00Z', '2026-05-15T12:00:00Z', 'project'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel');
  assert(m.warnings.includes('movement_classified_as_work_travel'));
  assertEquals(r.diagnostics.workTravelCount, 1);
  assertEquals(r.diagnostics.commuteTravelCount, 0);
});

Deno.test('Lager 3.4 — project→supplier = work_travel', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T10:00:00Z', 'project'),
    movementSeg({ id: 'm1', start: '2026-05-15T10:00:00Z', end: '2026-05-15T10:20:00Z',
      fromType: 'project', toType: 'supplier', distanceMeters: 4_000 }),
    siteSeg('s2', '2026-05-15T10:20:00Z', '2026-05-15T11:00:00Z', 'supplier'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel');
  assertEquals(r.diagnostics.workTravelCount, 1);
});

Deno.test('Lager 3.4 — project A → project B = work_travel', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project'),
    movementSeg({ id: 'm1', start: '2026-05-15T09:00:00Z', end: '2026-05-15T09:30:00Z',
      fromType: 'project', toType: 'project', distanceMeters: 6_000 }),
    siteSeg('s2', '2026-05-15T09:30:00Z', '2026-05-15T12:00:00Z', 'project'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel');
});

Deno.test('Lager 3.4 — hem → första arbetsplats = commute_travel', () => {
  const segs = [
    siteSeg('home', '2026-05-15T07:00:00Z', '2026-05-15T07:30:00Z', 'private_zone'),
    movementSeg({ id: 'm1', start: '2026-05-15T07:30:00Z', end: '2026-05-15T08:00:00Z',
      fromType: 'private_zone', toType: 'project', distanceMeters: 8_000 }),
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T16:00:00Z', 'project'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'commute_travel');
  assert(m.warnings.includes('normally_not_paid_commute'));
  assertEquals(r.diagnostics.commuteTravelCount, 1);
});

Deno.test('Lager 3.4 — sista arbetsplats → hem = commute_travel + homebound', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T16:00:00Z', 'project'),
    movementSeg({ id: 'm1', start: '2026-05-15T16:00:00Z', end: '2026-05-15T16:30:00Z',
      fromType: 'project', toType: 'private_zone', distanceMeters: 8_000 }),
    siteSeg('home', '2026-05-15T16:30:00Z', '2026-05-15T17:30:00Z', 'private_zone'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'commute_travel');
  assert(m.warnings.includes('normally_not_paid_homebound'));
});

Deno.test('Lager 3.4 — long travel >150 km → warning + paid_travel_possible-proposal', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T07:30:00Z', '2026-05-15T08:00:00Z', 'warehouse'),
    movementSeg({ id: 'm1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T11:00:00Z',
      fromType: 'warehouse', toType: 'project', distanceMeters: 220_000 }),
    siteSeg('s2', '2026-05-15T11:00:00Z', '2026-05-15T17:00:00Z', 'project'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel');
  assert(m.warnings.includes('long_travel_over_150km'));
  assertEquals(r.diagnostics.longTravelOver150kmCount, 1);
  const prop = r.proposals.find((p) => p.segmentId === 'm1');
  assert(prop, 'proposal saknas');
  assert(prop!.reason.includes('paid_travel_possible'));
});

Deno.test('Lager 3.4 — movement utan anchor = needs_work_allocation_review', () => {
  const segs = [
    movementSeg({ id: 'm1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T08:30:00Z',
      fromType: null, toType: null, distanceMeters: 5_000 }),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'needs_work_allocation_review');
  assert(m.warnings.includes('movement_missing_anchor'));
  assertEquals(r.diagnostics.movementReviewCount, 1);
});

Deno.test('Lager 3.4 — fallback: anchor härleds från grannsegment', () => {
  // movementMeta saknar fromTarget/toTarget men grannarna har matchedTarget.
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'warehouse'),
    movementSeg({ id: 'm1', start: '2026-05-15T09:00:00Z', end: '2026-05-15T09:30:00Z',
      fromType: null, toType: null, distanceMeters: 4_000 }),
    siteSeg('s2', '2026-05-15T09:30:00Z', '2026-05-15T12:00:00Z', 'project'),
  ];
  const r = run(segs);
  const m = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('m1'))!;
  assertEquals(m.allocationType, 'work_travel');
});
