/**
 * Lager 4.1 — Display Timeline Layer (read-only) tester.
 *
 * Verifierar:
 *   - Allokeringssegment → display-block med korrekt displayType
 *   - Kontigta likartade segment slås ihop
 *   - Severity härleds rätt
 *   - User-warnings filtreras
 *   - Actions genereras för review/supplier/unknown/gap
 *   - uncovered_workday_time-proposals blir break_or_gap-block
 *   - Read-only: ingen mutering av Lager 3-input
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildDisplayTimelineFromWorkdayAllocation,
  type DisplayTimelineResult,
} from './buildDisplayTimelineFromWorkdayAllocation.ts';
import type {
  WorkdayAllocationProposal,
  WorkdayAllocationResult,
  WorkdayAllocationSegment,
} from './buildWorkdayAllocationFromLocationTruth.ts';

function seg(over: Partial<WorkdayAllocationSegment>): WorkdayAllocationSegment {
  return {
    id: 'wda_x',
    startAt: '2026-05-15T08:00:00Z',
    endAt: '2026-05-15T09:00:00Z',
    sourceLocationTruthSegmentIds: ['lt_x'],
    allocationType: 'project_work',
    targetType: 'project',
    targetId: 'p1',
    label: 'Acme Project',
    address: 'Sveavägen 1',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    assignmentMatch: 'overlap',
    businessContextStatus: null,
    ...over,
  };
}

function wda(segments: WorkdayAllocationSegment[], proposals: WorkdayAllocationProposal[] = []): WorkdayAllocationResult {
  return {
    segments,
    proposals,
    diagnostics: { staffId: 'staff-1', date: '2026-05-15' } as any,
  };
}

function run(r: WorkdayAllocationResult): DisplayTimelineResult {
  return buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: null,
    locationTruthV2: null,
    workdayAllocation: r,
  });
}

// ── Mapping ──────────────────────────────────────────────────────────────

Deno.test('4.1: allocationType → displayType mapping', () => {
  const r = run(wda([
    seg({ id: 'a', allocationType: 'project_work', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T08:30:00Z' }),
    seg({ id: 'b', allocationType: 'large_project_work', targetType: 'large_project', startAt: '2026-05-15T08:30:00Z', endAt: '2026-05-15T09:00:00Z' }),
    seg({ id: 'c', allocationType: 'booking_work', targetType: 'booking', startAt: '2026-05-15T09:00:00Z', endAt: '2026-05-15T09:30:00Z' }),
    seg({ id: 'd', allocationType: 'warehouse_work', targetType: 'warehouse', startAt: '2026-05-15T09:30:00Z', endAt: '2026-05-15T10:00:00Z' }),
    seg({ id: 'e', allocationType: 'supplier_visit', targetType: 'supplier', startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T10:30:00Z' }),
    seg({ id: 'f', allocationType: 'work_travel', targetType: null, targetId: null, startAt: '2026-05-15T10:30:00Z', endAt: '2026-05-15T10:45:00Z' }),
    seg({ id: 'g', allocationType: 'commute_travel', targetType: null, targetId: null, startAt: '2026-05-15T10:45:00Z', endAt: '2026-05-15T11:00:00Z' }),
    seg({ id: 'h', allocationType: 'unlinked_work_address', targetType: null, targetId: null, startAt: '2026-05-15T11:00:00Z', endAt: '2026-05-15T11:30:00Z' }),
    seg({ id: 'i', allocationType: 'private_time', targetType: null, targetId: null, startAt: '2026-05-15T11:30:00Z', endAt: '2026-05-15T12:00:00Z' }),
    seg({ id: 'j', allocationType: 'needs_work_allocation_review', targetType: null, targetId: null, startAt: '2026-05-15T12:00:00Z', endAt: '2026-05-15T12:30:00Z' }),
  ]));
  const types = r.blocks.map((b) => b.displayType);
  assertEquals(types, ['project','large_project','booking','warehouse','supplier','travel','commute','unlinked_address','private','review']);
  assertEquals(r.diagnostics.outputBlockCount, 10);
  assertEquals(r.diagnostics.blocksByDisplayType.project, 1);
});

// ── Merge ────────────────────────────────────────────────────────────────

Deno.test('4.1: kontigta likartade segment slås ihop', () => {
  const r = run(wda([
    seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T08:30:00Z' }),
    seg({ id: 'b', startAt: '2026-05-15T08:30:00Z', endAt: '2026-05-15T09:00:00Z' }),
    seg({ id: 'c', startAt: '2026-05-15T09:00:00Z', endAt: '2026-05-15T09:45:00Z' }),
  ]));
  assertEquals(r.blocks.length, 1);
  assertEquals(r.blocks[0].metadata.mergedCount, 3);
  assertEquals(r.blocks[0].sourceAllocationSegmentIds, ['a', 'b', 'c']);
  assertEquals(r.blocks[0].durationMinutes, 105);
  assertEquals(r.diagnostics.mergedSegmentsCollapsed, 2);
});

Deno.test('4.1: olika targetId slås INTE ihop', () => {
  const r = run(wda([
    seg({ id: 'a', targetId: 'p1', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z' }),
    seg({ id: 'b', targetId: 'p2', label: 'Other', startAt: '2026-05-15T09:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
  ]));
  assertEquals(r.blocks.length, 2);
});

Deno.test('4.1: stora glapp (>2min) slås INTE ihop', () => {
  const r = run(wda([
    seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T08:30:00Z' }),
    seg({ id: 'b', startAt: '2026-05-15T09:00:00Z', endAt: '2026-05-15T09:30:00Z' }),
  ]));
  assertEquals(r.blocks.length, 2);
});

// ── Severity ─────────────────────────────────────────────────────────────

Deno.test('4.1: severity = needs_user_review för review/unlinked/gap', () => {
  const r = run(wda([
    seg({ id: 'a', allocationType: 'needs_work_allocation_review', targetType: null, targetId: null }),
    seg({ id: 'b', allocationType: 'unlinked_work_address', targetType: null, targetId: null, startAt: '2026-05-15T09:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
  ]));
  assertEquals(r.blocks[0].severity, 'needs_user_review');
  assertEquals(r.blocks[1].severity, 'needs_user_review');
});

Deno.test('4.1: severity = warning vid staff_not_assigned_to_matched_target', () => {
  const r = run(wda([
    seg({ id: 'a', warnings: ['staff_not_assigned_to_matched_target'] }),
  ]));
  assertEquals(r.blocks[0].severity, 'warning');
  assert(r.blocks[0].warnings.includes('staff_not_assigned_to_matched_target'));
});

Deno.test('4.1: severity = info vid low confidence', () => {
  const r = run(wda([
    seg({ id: 'a', confidence: 'low' }),
  ]));
  assertEquals(r.blocks[0].severity, 'info');
});

Deno.test('4.1: severity = normal för rent högkonfident assigned project', () => {
  const r = run(wda([seg({ id: 'a' })]));
  assertEquals(r.blocks[0].severity, 'normal');
  assertEquals(r.blocks[0].warnings.length, 0);
});

// ── Warnings filter ──────────────────────────────────────────────────────

Deno.test('4.1: interna warnings (segment_outside_workday) visas INTE för användaren', () => {
  const r = run(wda([
    seg({ id: 'a', warnings: ['segment_outside_workday', 'staff_not_assigned_to_matched_target'] }),
  ]));
  // Endast staff_not_assigned_to_matched_target ska ut till user.
  assertEquals(r.blocks[0].warnings, ['staff_not_assigned_to_matched_target']);
  // Båda ska ligga kvar i metadata för "visa mer".
  assert(r.blocks[0].metadata.rawAllocationWarnings.includes('segment_outside_workday'));
  assert(r.blocks[0].metadata.rawAllocationWarnings.includes('staff_not_assigned_to_matched_target'));
});

// ── Actions ──────────────────────────────────────────────────────────────

Deno.test('4.1: supplier-block med link-proposal → pick_project_for_supplier-action', () => {
  const r = run(wda(
    [seg({ id: 'a', allocationType: 'supplier_visit', targetType: 'supplier', targetId: 's1', label: 'Stuk', sourceLocationTruthSegmentIds: ['lt1'] })],
    [{
      segmentId: 'lt1',
      proposalType: 'link_supplier_to_project_candidate',
      proposedAllocationType: 'project_work',
      targetType: 'project', targetId: 'p1', label: 'Cand',
      startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z',
      confidence: 'medium', reason: 'x',
      candidateTargetType: 'project', candidateTargetId: 'p1', candidateLabel: 'Cand',
    }],
  ));
  const actions = r.blocks[0].actions.map((a) => a.type);
  assert(actions.includes('pick_project_for_supplier'));
});

Deno.test('4.1: unlinked_address → classify_unknown_address-action', () => {
  const r = run(wda([
    seg({ id: 'a', allocationType: 'unlinked_work_address', targetType: null, targetId: null }),
  ]));
  assert(r.blocks[0].actions.some((a) => a.type === 'classify_unknown_address'));
});

Deno.test('4.1: warning staff_not_assigned → confirm_allocation-action', () => {
  const r = run(wda([
    seg({ id: 'a', warnings: ['staff_not_assigned_to_matched_target'] }),
  ]));
  assert(r.blocks[0].actions.some((a) => a.type === 'confirm_allocation'));
});

// ── Uncovered gap ────────────────────────────────────────────────────────

Deno.test('4.1: uncovered_workday_time-proposal → break_or_gap-block med review + classify_uncovered_gap-action', () => {
  const r = run(wda(
    [seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:00:00Z' })],
    [{
      segmentId: 'gap1',
      proposalType: 'uncovered_workday_time',
      proposedAllocationType: 'needs_work_allocation_review',
      targetType: null, targetId: null, label: null,
      startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T12:00:00Z',
      confidence: 'low', reason: 'gap', severity: 'medium',
    }],
  ));
  assertEquals(r.blocks.length, 2);
  const gap = r.blocks.find((b) => b.displayType === 'break_or_gap')!;
  assert(gap, 'gap block saknas');
  assertEquals(gap.severity, 'needs_user_review');
  assertEquals(gap.durationMinutes, 120);
  assert(gap.actions.some((a) => a.type === 'classify_uncovered_gap'));
  assert(gap.warnings.includes('workday_time_without_location_truth_segment'));
});

// ── Subtitle / title ─────────────────────────────────────────────────────

Deno.test('4.1: title=label, subtitle=address + duration', () => {
  const r = run(wda([
    seg({ id: 'a', label: 'Acme', address: 'Sveavägen 1', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T09:30:00Z' }),
  ]));
  assertEquals(r.blocks[0].title, 'Acme');
  assertEquals(r.blocks[0].subtitle, 'Sveavägen 1 · 1 h 30 min');
});

Deno.test('4.1: title fallback till displayType-default', () => {
  const r = run(wda([
    seg({ id: 'a', label: null, address: null, allocationType: 'warehouse_work', targetType: 'warehouse' }),
  ]));
  assertEquals(r.blocks[0].title, 'Lager');
});

// ── Read-only ────────────────────────────────────────────────────────────

Deno.test('4.1: read-only — Lager 3-input muteras INTE', () => {
  const segments = [seg({ id: 'a', warnings: ['staff_not_assigned_to_matched_target'] })];
  const proposals: WorkdayAllocationProposal[] = [];
  const inputWda = wda(segments, proposals);
  const beforeSegJson = JSON.stringify(segments);
  const beforePropJson = JSON.stringify(proposals);
  run(inputWda);
  assertEquals(JSON.stringify(segments), beforeSegJson, 'segments muterades');
  assertEquals(JSON.stringify(proposals), beforePropJson, 'proposals muterades');
});

// ── Edge cases ───────────────────────────────────────────────────────────

Deno.test('4.1: null workdayAllocation → tomma blocks + warning', () => {
  const r = buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: null, locationTruthV2: null, workdayAllocation: null,
  });
  assertEquals(r.blocks.length, 0);
  assert(r.diagnostics.warnings.includes('no_workday_allocation_input'));
});

Deno.test('4.1: tom segments-lista → empty_workday_allocation warning', () => {
  const r = run(wda([]));
  assertEquals(r.blocks.length, 0);
  assert(r.diagnostics.warnings.includes('empty_workday_allocation'));
});

// ── Diagnostics ──────────────────────────────────────────────────────────

Deno.test('4.1: diagnostics räknar block per displayType och severity', () => {
  const r = run(wda([
    seg({ id: 'a', confidence: 'high' }),
    seg({ id: 'b', allocationType: 'unlinked_work_address', targetType: null, targetId: null, startAt: '2026-05-15T09:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
    seg({ id: 'c', warnings: ['staff_not_assigned_to_matched_target'], targetId: 'p2', startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T11:00:00Z' }),
  ]));
  assertEquals(r.diagnostics.outputBlockCount, 3);
  assertEquals(r.diagnostics.blocksBySeverity.normal, 1);
  assertEquals(r.diagnostics.blocksBySeverity.warning, 1);
  assertEquals(r.diagnostics.blocksBySeverity.needs_user_review, 1);
  assertEquals(r.diagnostics.reviewBlockCount, 1);
  assertEquals(r.diagnostics.totalDisplayMinutes, 60 + 60 + 60);
});
