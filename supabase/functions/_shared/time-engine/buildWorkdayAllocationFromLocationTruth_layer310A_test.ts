/**
 * Lager 3.10A — Supplier/warehouse/organization_location kräver INGEN assignment.
 *
 * Verifierar att:
 *   1. supplier utan assignment → assignmentStatus = 'no_assignment_required'
 *      OCH inga supplier_visit_no_assignment-warnings.
 *   2. warehouse utan assignment → assignmentStatus = 'no_assignment_required'
 *      OCH inga warehouse_presence_no_assignment-warnings.
 *   3. organization_location utan assignment → 'no_assignment_required'
 *      OCH inga organization_location_no_assignment-warnings.
 *   4. project utan assignment → 'unassigned_but_present'
 *      MED warning 'staff_not_assigned_to_matched_target'.
 *   5. booking utan assignment → 'unassigned_but_present' + warning.
 *   6. large_project utan assignment → 'unassigned_but_present' + warning.
 *   7. planning_geo_mismatch lever kvar oberoende av targetType.
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

function siteSeg(
  id: string, start: string, end: string,
  t: LocationTruthTargetType, status: string = 'matched_eventflow_target',
): LocationTruthSegment {
  const matched = { targetType: t, targetId: `${t}-1`, label: `${t} A` };
  const finalType: FinalLocationTruthSegmentType = 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_target',
    finalType,
    confidence: 'high',
    physicalLocation: { label: `${t} A`, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status, matchedTarget: matched },
    evidence: { assignmentSupportsTarget: false, pingCount: 5 } as any,
    warnings: [],
    diagnostics: {} as any,
  } as any;
}

function run(segments: LocationTruthSegment[]) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: [] } } as any,
    locationTruthV2: { segments, diagnostics: {} as any } as LocationTruthResult,
    workdayEnvelope: ENVELOPE,
  });
}

Deno.test('Lager 3.10A — supplier utan assignment = no_assignment_required, ingen warning', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier')]);
  const seg = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assert(seg, 'supplier_visit segment missing');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assert(!seg.warnings.includes('supplier_visit_no_assignment' as any));
});

Deno.test('Lager 3.10A — warehouse utan assignment = no_assignment_required, ingen warning', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'warehouse', 'warehouse_presence')]);
  const seg = r.segments.find((s) => s.allocationType === 'warehouse_work')!;
  assert(seg, 'warehouse_work segment missing');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assert(!seg.warnings.includes('warehouse_presence_no_assignment' as any));
});

Deno.test('Lager 3.10A — organization_location utan assignment = no_assignment_required', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'organization_location')]);
  const seg = r.segments.find((s) => s.allocationType === 'warehouse_work')!;
  assert(seg, 'warehouse_work (organization_location) segment missing');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
});

Deno.test('Lager 3.10A — project utan assignment = unassigned_but_present + warning', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'project')]);
  const seg = r.segments.find((s) => s.allocationType === 'project_work')!;
  assert(seg);
  assertEquals(seg.assignmentStatus, 'unassigned_but_present');
  assert(seg.warnings.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('Lager 3.10A — booking utan assignment = unassigned_but_present + warning', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'booking')]);
  const seg = r.segments.find((s) => s.allocationType === 'booking_work')!;
  assert(seg);
  assertEquals(seg.assignmentStatus, 'unassigned_but_present');
  assert(seg.warnings.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('Lager 3.10A — large_project utan assignment = unassigned_but_present + warning', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'large_project')]);
  const seg = r.segments.find((s) => s.allocationType === 'large_project_work')!;
  assert(seg);
  assertEquals(seg.assignmentStatus, 'unassigned_but_present');
  assert(seg.warnings.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('Lager 3.10A — planning_geo_mismatch lever kvar för supplier', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier', 'planning_geo_mismatch')]);
  const seg = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assert(seg);
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assert(seg.warnings.includes('planning_geo_mismatch'));
});
