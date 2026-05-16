// Fix D — Uncovered gaps från timer/envelope ska inte renderas som huvudblock.
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
    allocationType: 'warehouse_work',
    targetType: 'warehouse',
    targetId: 'w1',
    label: 'Lager',
    address: 'Lagervägen 1',
    confidence: 'high',
    warnings: [],
    assignmentStatus: 'assigned',
    assignmentMatch: 'overlap',
    businessContextStatus: null,
    ...over,
  } as any;
}

function gapProp(startAt: string, endAt: string): WorkdayAllocationProposal {
  return {
    segmentId: `workday-gap-${startAt}`,
    proposalType: 'uncovered_workday_time',
    proposedAllocationType: 'unlinked_work_address',
    targetType: null, targetId: null, label: null,
    startAt, endAt,
    confidence: 'low', reason: 'uncovered_workday_time',
    severity: 'medium',
  } as any;
}

function wda(
  segments: WorkdayAllocationSegment[],
  proposals: WorkdayAllocationProposal[] = [],
  warnings: string[] = [],
): WorkdayAllocationResult {
  return {
    segments, proposals,
    diagnostics: { staffId: 's1', date: '2026-05-15', warnings } as any,
  };
}

function run(r: WorkdayAllocationResult): DisplayTimelineResult {
  return buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: null, locationTruthV2: null, workdayAllocation: r,
  } as any);
}

Deno.test('Fix D — gap före första evidence renderas inte (Artjoms-liknande)', () => {
  // Workday startade 00:00 men första evidence 07:33 → 453 min gap före
  const r = run(wda(
    [seg({ startAt: '2026-05-15T07:33:00Z', endAt: '2026-05-15T15:00:00Z' })],
    [gapProp('2026-05-15T00:00:00Z', '2026-05-15T07:33:00Z')],
  ));
  const gapBlocks = r.blocks.filter((b) => b.displayType === 'break_or_gap');
  assertEquals(gapBlocks.length, 0, 'inget glapp-block ska renderas före första evidence');
  assertEquals((r.diagnostics as any).suppressedGapBeforeFirstEvidence, 1);
  assert((r.diagnostics as any).suppressedGapMinutesTotal >= 400);
  assert(r.diagnostics.warnings.includes('display_gap_suppressed_outside_work_evidence'));
});

Deno.test('Fix D — gap efter sista evidence (Nana: Lager 09:26–09:38, öppen timer till 20:43)', () => {
  const r = run(wda(
    [seg({ startAt: '2026-05-15T09:26:00Z', endAt: '2026-05-15T09:38:00Z' })],
    [gapProp('2026-05-15T09:38:00Z', '2026-05-15T20:43:00Z')], // 665 min
    ['open_timer_without_same_day_evidence'],
  ));
  // open_timer_without_same_day_evidence triggar hela suppress-display-grenen.
  // Vi vill bekräfta att INGA break_or_gap-block kommer ut.
  const gapBlocks = r.blocks.filter((b) => b.displayType === 'break_or_gap');
  assertEquals(gapBlocks.length, 0);
});

Deno.test('Fix D — gap efter sista evidence (envelope-baserat, ingen open-timer-suppress)', () => {
  const r = run(wda(
    [seg({ startAt: '2026-05-15T09:26:00Z', endAt: '2026-05-15T09:38:00Z' })],
    [gapProp('2026-05-15T09:38:00Z', '2026-05-15T20:43:00Z')], // 665 min efter sista evidence
  ));
  const gapBlocks = r.blocks.filter((b) => b.displayType === 'break_or_gap');
  assertEquals(gapBlocks.length, 0, 'inget glapp-block ska renderas efter sista evidence');
  assertEquals((r.diagnostics as any).suppressedGapAfterLastEvidence, 1);
});

Deno.test('Fix D — gap mitt i dagen mellan två work-block får fortfarande renderas', () => {
  const r = run(wda(
    [
      seg({ id: 'a', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T10:00:00Z' }),
      seg({ id: 'b', startAt: '2026-05-15T13:00:00Z', endAt: '2026-05-15T17:00:00Z' }),
    ],
    [gapProp('2026-05-15T10:00:00Z', '2026-05-15T13:00:00Z')], // 180 min, mitt i dagen
  ));
  const gapBlocks = r.blocks.filter((b) => b.displayType === 'break_or_gap');
  assertEquals(gapBlocks.length, 1, 'mid-day gap mellan two work blocks ska renderas');
  assertEquals((r.diagnostics as any).suppressedGapBeforeFirstEvidence ?? 0, 0);
  assertEquals((r.diagnostics as any).suppressedGapAfterLastEvidence ?? 0, 0);
});

Deno.test('Fix D — utan någon work-evidence: alla gaps suppressas', () => {
  const r = run(wda(
    [],
    [gapProp('2026-05-15T00:00:00Z', '2026-05-15T23:00:00Z')],
  ));
  const gapBlocks = r.blocks.filter((b) => b.displayType === 'break_or_gap');
  assertEquals(gapBlocks.length, 0);
  assertEquals((r.diagnostics as any).suppressedGapNoEvidenceAtAll, 1);
});
