/**
 * Lager 3.10B — Supplier project proposals har explicit proposalType + fält.
 *
 * Verifierar:
 *   1. proposalType = 'link_supplier_to_project_candidate'.
 *   2. reason mappas via SupplierLinkProposalReason-vokab.
 *   3. supplier-/candidate-fält + sourceSegmentIds + requiresHumanApproval finns.
 *   4. Utan projektkontext skapas INGEN link-proposal, men warning kvar.
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
  const finalType: FinalLocationTruthSegmentType = 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_target', finalType, confidence: 'high',
    physicalLocation: { label, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status: 'matched_eventflow_target', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: true, pingCount: 5 } as any,
    warnings: [], diagnostics: {} as any,
  } as any;
}

function run(segments: LocationTruthSegment[], assignments: any[] = []) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: assignments } } as any,
    locationTruthV2: { segments, diagnostics: {} as any } as LocationTruthResult,
    workdayEnvelope: ENVELOPE,
  });
}

Deno.test('3.10B — overlapping_assignment → reason supplier_near_overlapping_assignment', () => {
  const r = run(
    [siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier')],
    [{ projectId: 'proj-99', title: 'X', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T17:00:00Z' }],
  );
  const p = r.proposals.find((x) => x.proposalType === 'link_supplier_to_project_candidate');
  assert(p);
  assertEquals(p!.reason, 'supplier_near_overlapping_assignment');
  assertEquals(p!.candidateTargetId, 'proj-99');
  assertEquals(p!.supplierTargetId, 'supplier-1');
  assert(p!.sourceSegmentIds && p!.sourceSegmentIds.length >= 1);
  assertEquals(p!.requiresHumanApproval, true);
});

Deno.test('3.10B — warehouse→supplier→project → supplier_between_warehouse_and_project', () => {
  const r = run([
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T08:30:00Z', 'warehouse'),
    siteSeg('s2', '2026-05-15T09:00:00Z', '2026-05-15T09:30:00Z', 'supplier'),
    siteSeg('s3', '2026-05-15T10:00:00Z', '2026-05-15T15:00:00Z', 'project', 'proj-7'),
  ]);
  const p = r.proposals.find((x) => x.proposalType === 'link_supplier_to_project_candidate');
  assert(p);
  assertEquals(p!.reason, 'supplier_between_warehouse_and_project');
  assertEquals(p!.candidateTargetId, 'proj-7');
});

Deno.test('3.10B — project→supplier→project (samma) → supplier_between_project_and_project', () => {
  const r = run([
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project', 'proj-7'),
    siteSeg('s2', '2026-05-15T09:30:00Z', '2026-05-15T10:00:00Z', 'supplier'),
    siteSeg('s3', '2026-05-15T10:30:00Z', '2026-05-15T15:00:00Z', 'project', 'proj-7'),
  ]);
  const p = r.proposals.find((x) => x.proposalType === 'link_supplier_to_project_candidate');
  assert(p);
  assertEquals(p!.reason, 'supplier_between_project_and_project');
});

Deno.test('3.10B — endast project_before fallback → supplier_visit_linked_to_project_candidate', () => {
  const r = run([
    siteSeg('s1', '2026-05-15T08:00:00Z', '2026-05-15T09:00:00Z', 'project', 'proj-7'),
    siteSeg('s2', '2026-05-15T09:30:00Z', '2026-05-15T10:00:00Z', 'supplier'),
  ]);
  const p = r.proposals.find((x) => x.proposalType === 'link_supplier_to_project_candidate');
  assert(p);
  assertEquals(p!.reason, 'supplier_visit_linked_to_project_candidate');
});

Deno.test('3.10B — utan projektkontext → INGEN link-proposal, warning kvar', () => {
  const r = run([
    siteSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T10:00:00Z', 'supplier'),
  ]);
  const p = r.proposals.find((x) => x.proposalType === 'link_supplier_to_project_candidate');
  assertEquals(p, undefined);
  const sup = r.segments.find((s) => s.allocationType === 'supplier_visit')!;
  assert(sup.warnings.includes('supplier_visit_without_project_context'));
});
