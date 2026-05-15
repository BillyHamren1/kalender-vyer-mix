/**
 * Lager 3.10E — AI-review triggers via warnings/businessContext.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { shouldTriggerAiReview, buildAiWorkdayReviewInput } from './aiWorkdayReviewer.ts';
import type {
  WorkdayAllocationSegment,
  WorkdayAllocationResult,
} from './buildWorkdayAllocationFromLocationTruth.ts';

function seg(over: Partial<WorkdayAllocationSegment> = {}): WorkdayAllocationSegment {
  return {
    id: 'wda-1',
    startAt: '2026-05-15T08:00:00Z',
    endAt: '2026-05-15T09:00:00Z',
    sourceLocationTruthSegmentIds: ['lt-1'],
    allocationType: 'project_work',
    targetType: 'project',
    targetId: 't-1',
    label: 'P',
    address: 'Adr',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    businessContextStatus: null,
    ...over,
  } as WorkdayAllocationSegment;
}

Deno.test('3.10E — known_address + LP missing geo via warning triggar large_project_missing_geo', () => {
  const t = shouldTriggerAiReview(seg({
    targetType: null,
    allocationType: 'unlinked_work_address',
    address: 'Site',
    warnings: ['large_project_missing_geo'] as never,
  }));
  assert(t.includes('large_project_missing_geo'));
  assert(t.includes('unlinked_work_address'));
});

Deno.test('3.10E — businessContextStatus needs_review triggar business_context_needs_review', () => {
  const t = shouldTriggerAiReview(seg({ businessContextStatus: 'needs_review' as never }));
  assert(t.includes('business_context_needs_review'));
});

Deno.test('3.10E — assigned_large_project_missing_geo via warning', () => {
  const t = shouldTriggerAiReview(seg({
    warnings: ['assigned_large_project_missing_geo'] as never,
  }));
  assert(t.includes('assigned_large_project_missing_geo'));
});

Deno.test('3.10E — business_target_missing_geo via businessContextStatus', () => {
  const t = shouldTriggerAiReview(seg({
    businessContextStatus: 'business_target_missing_geo' as never,
  }));
  assert(t.includes('business_target_missing_geo'));
});

Deno.test('3.10E — uncovered_workday_time medium → proposalCase', () => {
  const wda = {
    segments: [],
    proposals: [{
      segmentId: 'gap-1',
      proposalType: 'uncovered_workday_time',
      reason: 'uncovered_workday_time',
      startAt: '2026-05-15T10:00:00Z',
      endAt: '2026-05-15T13:00:00Z',
      suggestedEndAt: null,
      confidence: 'medium',
      severity: 'medium',
    }],
    diagnostics: { staffId: 's', date: '2026-05-15', workdayStartAt: null, workdayEndAt: null, openWorkday: false },
  } as unknown as WorkdayAllocationResult;
  const input = buildAiWorkdayReviewInput({ dayEvidence: null, locationTruthV2: null, workdayAllocation: wda });
  assertEquals(input.proposalCases.length, 1);
  assertEquals(input.proposalCases[0].triggers, ['uncovered_workday_time']);
  assertEquals(input.diagnostics.triggerCounts.uncovered_workday_time, 1);
});

Deno.test('3.10E — uncovered_workday_time low → ignoreras', () => {
  const wda = {
    segments: [],
    proposals: [{
      segmentId: 'gap-1',
      proposalType: 'uncovered_workday_time',
      reason: 'uncovered_workday_time',
      startAt: '2026-05-15T10:00:00Z',
      endAt: '2026-05-15T10:45:00Z',
      suggestedEndAt: null,
      confidence: 'low',
      severity: 'low',
    }],
    diagnostics: { staffId: 's', date: '2026-05-15', workdayStartAt: null, workdayEndAt: null, openWorkday: false },
  } as unknown as WorkdayAllocationResult;
  const input = buildAiWorkdayReviewInput({ dayEvidence: null, locationTruthV2: null, workdayAllocation: wda });
  assertEquals(input.proposalCases.length, 0);
});

Deno.test('3.10E — outsideWorkday triggar inget AI-review', () => {
  const t = shouldTriggerAiReview(seg({
    outsideWorkday: true,
    warnings: ['large_project_missing_geo'] as never,
    businessContextStatus: 'needs_review' as never,
  }));
  assertEquals(t.length, 0);
});
