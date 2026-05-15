/**
 * Lager 3.10F — Read-only kontroll efter städning (3.10A–E).
 *
 * Verifierar att slutläget för Workday Allocation + AI-trigger uppfyller
 * alla 6 acceptanskriterier:
 *   1. Supplierbesök utan assignment → no_assignment_required, ingen no-assignment-warning
 *   2. Warehouse utan assignment → no_assignment_required, ingen no-assignment-warning
 *   3. Projekt utan assignment → unassigned_but_present + staff_not_assigned_to_matched_target
 *   4. Supplier + projektkandidat → proposalType = link_supplier_to_project_candidate
 *   5. Uncovered gap → uncovered_workday_time (inte automatiskt review)
 *   6. LP missing geo som warning/businessContext → AI-review triggas
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import { shouldTriggerAiReview } from './aiWorkdayReviewer.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  FinalLocationTruthSegmentType,
} from './buildLocationTruthFromDayEvidence.ts';
import type { WorkdayAllocationSegment } from './buildWorkdayAllocationFromLocationTruth.ts';

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
  t: LocationTruthTargetType, status = 'matched_eventflow_target',
): LocationTruthSegment {
  const matched = { targetType: t, targetId: `${t}-1`, label: `${t} A` };
  const finalType: FinalLocationTruthSegmentType = 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_target', finalType, confidence: 'high',
    physicalLocation: { label: `${t} A`, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status, matchedTarget: matched },
    evidence: { assignmentSupportsTarget: false, pingCount: 5 } as any,
    warnings: [], diagnostics: {} as any,
  } as any;
}

function run(segments: LocationTruthSegment[]) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: [] } } as any,
    locationTruthV2: { segments, diagnostics: {} as any } as LocationTruthResult,
    workdayEnvelope: ENVELOPE,
  });
}

// ── Fall 1 ───────────────────────────────────────────────────────────────
Deno.test('3.10F#1 — supplier utan assignment', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier')]);
  const seg = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(seg.allocationType, 'supplier_visit');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assert(!seg.warnings.includes('supplier_visit_no_assignment' as any));
});

// ── Fall 2 ───────────────────────────────────────────────────────────────
Deno.test('3.10F#2 — warehouse utan assignment', () => {
  const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'warehouse', 'warehouse_presence')]);
  const seg = r.segments.find((s) => s.allocationType === 'warehouse_work')!;
  assertEquals(seg.allocationType, 'warehouse_work');
  assertEquals(seg.assignmentStatus, 'no_assignment_required');
  assert(!seg.warnings.includes('warehouse_presence_no_assignment' as any));
});

// ── Fall 3 ───────────────────────────────────────────────────────────────
Deno.test('3.10F#3 — projekt utan assignment', () => {
  for (const tt of ['project', 'booking', 'large_project'] as const) {
    const r = run([siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', tt)]);
    const expected = tt === 'project' ? 'project_work' : tt === 'booking' ? 'booking_work' : 'large_project_work';
    const seg = r.segments.find((s) => s.allocationType === expected)!;
    assert(seg, `${tt} segment missing`);
    assertEquals(seg.assignmentStatus, 'unassigned_but_present');
    assert(seg.warnings.includes('staff_not_assigned_to_matched_target'));
  }
});

// ── Fall 4 ───────────────────────────────────────────────────────────────
Deno.test('3.10F#4 — supplier med projektkandidat → link_supplier_to_project_candidate', () => {
  const r = run([
    siteSeg('a', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project'),
    siteSeg('b', '2026-05-15T09:05:00Z', '2026-05-15T09:55:00Z', 'supplier'),
    siteSeg('c', '2026-05-15T10:00:00Z', '2026-05-15T11:00:00Z', 'project'),
  ]);
  const linkProp = r.proposals.find((p) => p.proposalType === 'link_supplier_to_project_candidate');
  assert(linkProp, 'link_supplier_to_project_candidate proposal missing');
  assertEquals(linkProp!.requiresHumanApproval, true);
});

// ── Fall 5 ───────────────────────────────────────────────────────────────
Deno.test('3.10F#5 — uncovered gap → uncovered_workday_time, inte review', () => {
  // Bara ett kort segment i mitten av workday → långa täckningsluckor i kanterna.
  const r = run([siteSeg('s1', '2026-05-15T11:00:00Z', '2026-05-15T12:00:00Z', 'project')]);
  const gaps = r.proposals.filter((p) => p.proposalType === 'uncovered_workday_time');
  assert(gaps.length > 0, 'uncovered_workday_time saknas');
  // Får inte ha needs_work_allocation_review utom när inget LT-segment finns alls.
  for (const g of gaps) {
    assert(g.proposedAllocationType !== 'needs_work_allocation_review' || g.severity === 'high',
      'gap blev review utan att vara high severity');
  }
});

// ── Fall 6 ───────────────────────────────────────────────────────────────
Deno.test('3.10F#6 — LP missing geo som warning/businessContext → AI-review triggas', () => {
  const baseSeg: WorkdayAllocationSegment = {
    id: 'wda', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z',
    sourceLocationTruthSegmentIds: ['lt'], allocationType: 'unlinked_work_address',
    targetType: null, targetId: null, label: 'Site', address: 'Adr',
    confidence: 'medium', warnings: [], assignmentStatus: 'unknown',
    businessContextStatus: null,
  } as WorkdayAllocationSegment;

  // (a) warning
  const tA = shouldTriggerAiReview({ ...baseSeg, warnings: ['large_project_missing_geo'] as any });
  assert(tA.includes('large_project_missing_geo'));

  // (b) businessContext
  const tB = shouldTriggerAiReview({ ...baseSeg, businessContextStatus: 'large_project_missing_geo' as any });
  assert(tB.includes('large_project_missing_geo'));

  // (c) assigned_large_project_missing_geo via warning
  const tC = shouldTriggerAiReview({ ...baseSeg, warnings: ['assigned_large_project_missing_geo'] as any });
  assert(tC.includes('assigned_large_project_missing_geo'));

  // (d) generic needs_review från Lager 2
  const tD = shouldTriggerAiReview({ ...baseSeg, businessContextStatus: 'needs_review' as any });
  assert(tD.includes('business_context_needs_review'));
});
