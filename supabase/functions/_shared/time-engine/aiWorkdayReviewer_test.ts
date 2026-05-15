/**
 * Lager 3.7 — AI Workday Reviewer (read-only, förslag-only).
 *
 * Verifierar:
 *   1. shouldTriggerAiReview triggar på rätt fall (deterministiskt).
 *   2. buildAiWorkdayReviewInput plockar ut osäkra segment + osäkra
 *      suggest_workday_end-proposals.
 *   3. Bekräftade segment (assigned_overlap, project_work) triggar inte AI.
 *   4. Default reviewer = noop → tom proposals-array.
 *   5. Mock reviewer → alla förslag har requiresHumanApproval=true och
 *      gissar ALDRIG targets (targetType/targetId = null).
 *   6. Read-only: input-strukturen muteras inte.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildAiWorkdayReviewInput,
  reviewWorkdayWithAi,
  shouldTriggerAiReview,
  type AiReviewSegmentCase,
} from './aiWorkdayReviewer.ts';
import type {
  WorkdayAllocationResult,
  WorkdayAllocationSegment,
} from './buildWorkdayAllocationFromLocationTruth.ts';

function wdaSeg(partial: Partial<WorkdayAllocationSegment>): WorkdayAllocationSegment {
  return {
    id: 'wda_x',
    startAt: '2026-05-15T08:00:00.000Z',
    endAt: '2026-05-15T09:00:00.000Z',
    sourceLocationTruthSegmentIds: ['lt_x'],
    allocationType: 'project_work',
    targetType: 'project',
    targetId: 'p1',
    label: 'Projekt A',
    address: 'A 1',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    businessContextStatus: 'matched_eventflow_target',
    outsideWorkday: false,
    ...partial,
  } as WorkdayAllocationSegment;
}

function wdaResult(segments: WorkdayAllocationSegment[], proposals: any[] = []): WorkdayAllocationResult {
  return {
    segments,
    proposals,
    diagnostics: {
      staffId: 'staff-1',
      date: '2026-05-15',
      builtAtIso: '2026-05-15T07:00:00Z',
      workdayStartAt: '2026-05-15T07:00:00Z',
      workdayEndAt: '2026-05-15T18:00:00Z',
      openWorkday: false,
    } as any,
  } as WorkdayAllocationResult;
}

Deno.test('Lager 3.7 — bekräftat project_work triggar inte AI', () => {
  const seg = wdaSeg({});
  assertEquals(shouldTriggerAiReview(seg), []);
});

Deno.test('Lager 3.7 — supplier_visit_without_project_context triggar', () => {
  const seg = wdaSeg({
    allocationType: 'supplier_visit',
    targetType: 'supplier',
    warnings: ['supplier_visit_without_project_context'],
  });
  assert(shouldTriggerAiReview(seg).includes('supplier_visit_without_project_context'));
});

Deno.test('Lager 3.7 — unlinked_work_address + planning_geo_mismatch triggar båda', () => {
  const seg = wdaSeg({
    allocationType: 'unlinked_work_address',
    targetType: null,
    targetId: null,
    warnings: ['no_project_link', 'planning_geo_mismatch'],
    assignmentStatus: 'unknown',
  });
  const t = shouldTriggerAiReview(seg);
  assert(t.includes('unlinked_work_address'));
  assert(t.includes('planning_geo_mismatch'));
});

Deno.test('Lager 3.7 — unassigned_but_present triggar', () => {
  const seg = wdaSeg({
    assignmentStatus: 'unassigned_but_present',
    warnings: ['staff_not_assigned_to_matched_target'],
  });
  assert(shouldTriggerAiReview(seg).includes('unassigned_but_present'));
});

Deno.test('Lager 3.7 — large_project utan address triggar large_project_missing_geo', () => {
  const seg = wdaSeg({
    allocationType: 'large_project_work',
    targetType: 'large_project',
    targetId: 'lp1',
    address: null,
  });
  assert(shouldTriggerAiReview(seg).includes('large_project_missing_geo'));
});

Deno.test('Lager 3.7 — movement_missing_anchor triggar', () => {
  const seg = wdaSeg({
    allocationType: 'needs_work_allocation_review',
    targetType: null,
    warnings: ['movement_missing_anchor'],
  });
  assert(shouldTriggerAiReview(seg).includes('movement_missing_anchor'));
});

Deno.test('Lager 3.7 — outsideWorkday triggar aldrig AI', () => {
  const seg = wdaSeg({
    outsideWorkday: true,
    allocationType: 'unlinked_work_address',
    warnings: ['no_project_link'],
  });
  assertEquals(shouldTriggerAiReview(seg), []);
});

Deno.test('Lager 3.7 — buildAiWorkdayReviewInput samlar bara osäkra fall', () => {
  const ok = wdaSeg({ id: 'wda_ok' });
  const supplier = wdaSeg({
    id: 'wda_sup',
    allocationType: 'supplier_visit',
    targetType: 'supplier',
    warnings: ['supplier_visit_without_project_context'],
  });
  const proposals = [
    {
      segmentId: 'lt_home',
      proposalType: 'suggest_workday_end',
      proposedAllocationType: 'private_time',
      targetType: null, targetId: null, label: null,
      startAt: '2026-05-15T16:00:00Z', endAt: '2026-05-15T18:00:00Z',
      suggestedEndAt: '2026-05-15T16:00:00Z',
      confidence: 'medium',
      reason: 'home_private_over_90_minutes_after_last_work_location',
    },
    {
      // High-confidence stop-förslag → inte med
      segmentId: 'lt_home2',
      proposalType: 'suggest_workday_end',
      proposedAllocationType: 'private_time',
      targetType: null, targetId: null, label: null,
      startAt: '2026-05-15T17:00:00Z', endAt: '2026-05-15T19:00:00Z',
      confidence: 'high',
      reason: 'high_confidence_end',
    },
  ];
  const input = buildAiWorkdayReviewInput({
    dayEvidence: null,
    locationTruthV2: null,
    workdayAllocation: wdaResult([ok, supplier], proposals),
  });
  assertEquals(input.segmentCases.length, 1);
  assertEquals(input.segmentCases[0].allocationSegmentId, 'wda_sup');
  assertEquals(input.proposalCases.length, 1);
  assertEquals(input.proposalCases[0].confidence, 'medium');
  assertEquals(input.diagnostics.triggerCounts.supplier_visit_without_project_context, 1);
  assertEquals(input.diagnostics.triggerCounts.uncertain_workday_end_proposal, 1);
});

Deno.test('Lager 3.7 — default reviewer = noop, tomma proposals', () => {
  const input = buildAiWorkdayReviewInput({
    dayEvidence: null, locationTruthV2: null,
    workdayAllocation: wdaResult([
      wdaSeg({ allocationType: 'unlinked_work_address', targetType: null, targetId: null,
        warnings: ['no_project_link'] }),
    ]),
  });
  const out = reviewWorkdayWithAi(input);
  assertEquals(out.reviewer.kind, 'noop');
  assertEquals(out.proposals, []);
  assert(out.summary.includes('osäkra'));
});

Deno.test('Lager 3.7 — mock reviewer kräver alltid mänsklig granskning och gissar inte targets', () => {
  const input = buildAiWorkdayReviewInput({
    dayEvidence: null, locationTruthV2: null,
    workdayAllocation: wdaResult([
      wdaSeg({
        id: 'wda_a', allocationType: 'supplier_visit', targetType: 'supplier',
        warnings: ['supplier_visit_without_project_context'],
      }),
    ]),
  });
  const out = reviewWorkdayWithAi(input, { reviewerKind: 'mock' });
  assertEquals(out.reviewer.kind, 'mock');
  assertEquals(out.proposals.length, 1);
  for (const p of out.proposals) {
    assertEquals(p.requiresHumanApproval, true);
    assertEquals(p.targetType, null); // får aldrig gissa target
    assertEquals(p.targetId, null);
    assert(p.warnings.includes('ai_mock_reviewer_no_external_call'));
  }
});

Deno.test('Lager 3.7 — read-only: input-struktur muteras inte', () => {
  const seg = wdaSeg({
    id: 'wda_a', allocationType: 'supplier_visit', targetType: 'supplier',
    warnings: ['supplier_visit_without_project_context'],
  });
  const result = wdaResult([seg]);
  const snapshot = JSON.stringify(result);
  const input = buildAiWorkdayReviewInput({
    dayEvidence: null, locationTruthV2: null, workdayAllocation: result,
  });
  reviewWorkdayWithAi(input, { reviewerKind: 'mock' });
  assertEquals(JSON.stringify(result), snapshot);
});
