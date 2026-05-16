// Fix C — Review-block mellan två block med samma target ska absorberas.
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
    allocationType: 'booking_work',
    targetType: 'booking',
    targetId: 'b1',
    label: 'Westmans',
    address: 'Storgatan 1',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    assignmentMatch: 'overlap',
    businessContextStatus: null,
    ...over,
  } as any;
}

function wda(segments: WorkdayAllocationSegment[], proposals: WorkdayAllocationProposal[] = []): WorkdayAllocationResult {
  return {
    segments, proposals,
    diagnostics: { staffId: 's1', date: '2026-05-15' } as any,
  };
}

function run(r: WorkdayAllocationResult): DisplayTimelineResult {
  return buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: null, locationTruthV2: null, workdayAllocation: r,
  } as any);
}

Deno.test('Fix C — review ≤45 min mellan samma booking absorberas, inget gult eget block', () => {
  const r = run(wda([
    // Bokning Westmans 08:00–10:00
    seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
    // Review 10:00–10:35 (35 min)
    seg({
      id: 'rev', allocationType: 'needs_work_allocation_review',
      targetType: null, targetId: null, label: null,
      startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T10:35:00Z',
    }),
    // Bokning Westmans 10:35–18:00
    seg({ id: 'b', startAt: '2026-05-15T10:35:00Z', endAt: '2026-05-15T18:00:00Z' }),
  ]));

  const reviewBlocks = r.blocks.filter((b) => b.displayType === 'review');
  assertEquals(reviewBlocks.length, 0, 'review-blocket ska inte renderas');
  const bookingBlocks = r.blocks.filter((b) => b.displayType === 'booking');
  assertEquals(bookingBlocks.length, 1, 'de två booking-blocken ska vara ett sammanslaget');
  const host = bookingBlocks[0];
  assertEquals(host.startAt, '2026-05-15T08:00:00Z');
  assertEquals(host.endAt, '2026-05-15T18:00:00Z');
  const meta: any = host.metadata;
  assertEquals(meta.absorbedReviewMinutes, 35);
  assert(Array.isArray(meta.absorbedReviewBlockIds) && meta.absorbedReviewBlockIds.length === 1);
  assert(
    host.humanWarnings.some((w) => w.includes('Granska mellanperiod 35 min')),
    'humanWarning ska beskriva absorberad granskningstid',
  );
  assertEquals((r.diagnostics as any).absorbedReviewBetweenSameTargetCount, 1);
  assertEquals((r.diagnostics as any).absorbedReviewMinutesTotal, 35);
});

Deno.test('Fix C — review >45 min absorberas INTE (förblir eget block)', () => {
  const r = run(wda([
    seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
    seg({
      id: 'rev', allocationType: 'needs_work_allocation_review',
      targetType: null, targetId: null, label: null,
      startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T11:00:00Z', // 60 min
    }),
    seg({ id: 'b', startAt: '2026-05-15T11:00:00Z', endAt: '2026-05-15T18:00:00Z' }),
  ]));
  const reviewBlocks = r.blocks.filter((b) => b.displayType === 'review');
  assertEquals(reviewBlocks.length, 1, 'långt review-block ska behållas');
  assertEquals((r.diagnostics as any).absorbedReviewBetweenSameTargetCount, 0);
});

Deno.test('Fix C — review mellan OLIKA targets behålls (competing)', () => {
  const r = run(wda([
    seg({ id: 'a', targetId: 'b1', label: 'Westmans', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
    seg({
      id: 'rev', allocationType: 'needs_work_allocation_review',
      targetType: null, targetId: null, label: null,
      startAt: '2026-05-15T10:00:00Z', endAt: '2026-05-15T10:20:00Z',
    }),
    seg({ id: 'b', targetId: 'b2', label: 'Andersson', startAt: '2026-05-15T10:20:00Z', endAt: '2026-05-15T18:00:00Z' }),
  ]));
  const reviewBlocks = r.blocks.filter((b) => b.displayType === 'review');
  assertEquals(reviewBlocks.length, 1, 'review mellan olika targets ska visas');
});
