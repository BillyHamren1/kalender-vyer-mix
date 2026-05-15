/**
 * Lager 3.5 — Supplierbesök och projektkandidat.
 *
 * Verifierar att supplier_visit:
 *   1. får candidate via överlappande assignment.
 *   2. mönster warehouse → supplier → project väljer project (high).
 *   3. mönster project → supplier → project (samma) väljer projektet (high).
 *   4. mönster project → supplier → warehouse väljer prev project (medium).
 *   5. fallback project_before när bara prev finns.
 *   6. fallback project_after när bara next finns.
 *   7. utan kontext → warning supplier_visit_without_project_context.
 *   8. proposal supplier_visit_linked_to_project_candidate skapas.
 *   9. Diagnostics: supplierVisits / linked / withoutProjectContext.
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
  t: LocationTruthTargetType, targetId = `${t}-1`, label = `${t} A`,
): LocationTruthSegment {
  const matched = { targetType: t, targetId, label };
  const finalType: FinalLocationTruthSegmentType =
    t === 'private_zone' ? 'private_residence' : 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: finalType === 'private_residence' ? 'private_residence' : 'known_target',
    finalType,
    confidence: 'high',
    physicalLocation: { label, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status: 'matched_eventflow_target', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: true, pingCount: 5 } as any,
    warnings: [],
    diagnostics: {} as any,
  } as any;
}

function fakeLT(segments: LocationTruthSegment[]): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1', date: '2026-05-15', builtAtIso: '2026-05-15T00:00:00Z',
      buildDurationMs: 0, warnings: [],
    } as any,
  } as LocationTruthResult;
}

function fakeDayEv(items: any[] = []) {
  return { assignments: { items } } as any;
}

function run(segments: LocationTruthSegment[], assignments: any[] = []) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: fakeDayEv(assignments),
    locationTruthV2: fakeLT(segments),
    workdayEnvelope: ENVELOPE,
  });
}

Deno.test('Lager 3.5 — överlappande assignment ger high-confidence kandidat', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier'),
  ];
  const assignments = [{
    projectId: 'proj-99', largeProjectId: null, bookingId: null,
    title: 'Projekt X', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T17:00:00Z',
  }];
  const r = run(segs, assignments);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assert(sup.linkedProjectCandidate);
  assertEquals(sup.linkedProjectCandidate!.source, 'overlapping_assignment');
  assertEquals(sup.linkedProjectCandidate!.targetId, 'proj-99');
  assertEquals(sup.linkedProjectCandidate!.confidence, 'high');
  assertEquals(r.diagnostics.supplierVisitsLinkedToProjectCandidate, 1);
  assertEquals(r.diagnostics.supplierVisitsWithoutProjectContext, 0);
  const prop = r.proposals.find((p) => p.reason.startsWith('supplier_visit_linked_to_project_candidate'));
  assert(prop);
});

Deno.test('Lager 3.5 — pattern warehouse → supplier → project = high', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T08:30:00Z', 'warehouse'),
    siteSeg('s2', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
    siteSeg('s3', '2026-05-15T10:00:00Z', '2026-05-15T15:00:00Z', 'project', 'proj-7'),
  ];
  const r = run(segs);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assert(sup.linkedProjectCandidate);
  assertEquals(sup.linkedProjectCandidate!.source, 'pattern_warehouse_supplier_project');
  assertEquals(sup.linkedProjectCandidate!.targetId, 'proj-7');
});

Deno.test('Lager 3.5 — pattern project → supplier → project (samma) = high', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project', 'proj-7'),
    siteSeg('s2', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
    siteSeg('s3', '2026-05-15T10:00:00Z', '2026-05-15T15:00:00Z', 'project', 'proj-7'),
  ];
  const r = run(segs);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(sup.linkedProjectCandidate?.source, 'pattern_project_supplier_project');
  assertEquals(sup.linkedProjectCandidate?.targetId, 'proj-7');
});

Deno.test('Lager 3.5 — pattern project → supplier → warehouse = medium (prev project)', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project', 'proj-7'),
    siteSeg('s2', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
    siteSeg('s3', '2026-05-15T10:00:00Z', '2026-05-15T15:00:00Z', 'warehouse'),
  ];
  const r = run(segs);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(sup.linkedProjectCandidate?.source, 'pattern_project_supplier_warehouse');
  assertEquals(sup.linkedProjectCandidate?.targetId, 'proj-7');
});

Deno.test('Lager 3.5 — fallback: bara projekt före → project_before', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project', 'proj-7'),
    siteSeg('s2', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
  ];
  const r = run(segs);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(sup.linkedProjectCandidate?.source, 'project_before');
});

Deno.test('Lager 3.5 — fallback: bara projekt efter → project_after', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
    siteSeg('s2', '2026-05-15T10:00:00Z', '2026-05-15T15:00:00Z', 'project', 'proj-7'),
  ];
  const r = run(segs);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(sup.linkedProjectCandidate?.source, 'project_after');
});

Deno.test('Lager 3.5 — supplier utan kontext → warning + räknare', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
  ];
  const r = run(segs);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(sup.linkedProjectCandidate, null);
  assert(sup.warnings.includes('supplier_visit_without_project_context'));
  assertEquals(r.diagnostics.supplierVisits, 1);
  assertEquals(r.diagnostics.supplierVisitsLinkedToProjectCandidate, 0);
  assertEquals(r.diagnostics.supplierVisitsWithoutProjectContext, 1);
});

Deno.test('Lager 3.5 — assignment utan tidsöverlapp ignoreras', () => {
  const segs = [
    siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
  ];
  const assignments = [{
    projectId: 'proj-99', largeProjectId: null, bookingId: null,
    title: 'Projekt X', startAt: '2026-05-15T13:00:00Z', endAt: '2026-05-15T17:00:00Z',
  }];
  const r = run(segs, assignments);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assertEquals(sup.linkedProjectCandidate, null);
  assert(sup.warnings.includes('supplier_visit_without_project_context'));
});
