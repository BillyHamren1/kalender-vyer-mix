// Time Engine 4.5 — clampBlocksToDayEndDecision tests
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { clampBlocksToDayEndDecision } from '../clampBlocksToDayEndDecision.ts';
import type { ReportCandidateBlock } from '../buildReportCandidateBlocks.ts';
import type { DayEndDecision } from '../computeDayEndDecision.ts';

const date = '2026-05-12';

function mkBlock(p: Partial<ReportCandidateBlock>): ReportCandidateBlock {
  return {
    id: p.id ?? 'b1',
    kind: 'work',
    startAt: p.startAt ?? '2026-05-12T08:00:00Z',
    endAt: p.endAt ?? '2026-05-12T10:00:00Z',
    durationMinutes: 120,
    durationLabel: '2 h 0 min',
    title: 'Project',
    subtitle: '08:00–10:00 · 2 h 0 min',
    targetType: 'project',
    targetId: 'p1',
    targetLabel: 'Project',
    confidence: 'high',
    confidenceReason: 'engine',
    reviewState: 'ok',
    reviewReasons: [],
    isOngoing: false,
    ...p,
  } as ReportCandidateBlock;
}

const decisionEnded = (endedAt: string): DayEndDecision => ({
  dayEnded: true,
  endedAt,
  endReason: 'private_residence_after_last_work',
  confidence: 'high',
  evidence: [],
});

const decisionStillActive: DayEndDecision = {
  dayEnded: false,
  endedAt: null,
  endReason: 'still_active',
  confidence: 'medium',
  evidence: [],
};

Deno.test('clamp: drops blocks starting after endedAt', () => {
  const blocks = [
    mkBlock({ id: 'a', endAt: '2026-05-12T15:00:00Z' }),
    mkBlock({ id: 'b', startAt: '2026-05-12T16:00:00Z', endAt: '2026-05-12T17:00:00Z' }),
  ];
  const r = clampBlocksToDayEndDecision({
    date,
    blocks,
    dayEndDecision: decisionEnded('2026-05-12T15:00:00Z'),
    nowIso: '2026-05-12T20:00:00Z',
  });
  assertEquals(r.blocks.length, 1);
  assertEquals(r.dropped.length, 1);
  assertEquals(r.dropped[0].id, 'b');
});

Deno.test('clamp: trims blocks overlapping endedAt and forces isOngoing=false', () => {
  const blocks = [
    mkBlock({
      id: 'open',
      startAt: '2026-05-12T14:00:00Z',
      endAt: '2026-05-12T20:00:00Z',
      isOngoing: true,
    }),
  ];
  const r = clampBlocksToDayEndDecision({
    date,
    blocks,
    dayEndDecision: decisionEnded('2026-05-12T16:00:00Z'),
    nowIso: '2026-05-12T20:00:00Z',
    openActiveStartedAtIso: '2026-05-12T14:00:00Z',
  });
  assertEquals(r.blocks[0].endAt, '2026-05-12T16:00:00.000Z');
  assertEquals(r.blocks[0].isOngoing, false);
  assert(r.blocks[0].reviewReasons!.includes('clamped_to_day_end_decision'));
  assert(r.blocks[0].warningReasons!.includes('open_active_timer_ignored_after_day_end'));
  assertEquals(r.diagnostics.openActiveTimerIgnored, true);
  assertEquals(r.diagnostics.blocksClamped, 1);
});

Deno.test('clamp: historical day forces isOngoing=false even without dayEnded', () => {
  const blocks = [mkBlock({ isOngoing: true })];
  const r = clampBlocksToDayEndDecision({
    date,
    blocks,
    dayEndDecision: decisionStillActive,
    nowIso: '2026-05-15T12:00:00Z', // 3 dagar senare
  });
  assertEquals(r.blocks[0].isOngoing, false);
  assertEquals(r.diagnostics.isToday, false);
});

Deno.test('clamp: today + still_active leaves blocks unchanged', () => {
  const blocks = [mkBlock({ isOngoing: true, endAt: '2026-05-12T18:00:00Z' })];
  const r = clampBlocksToDayEndDecision({
    date,
    blocks,
    dayEndDecision: decisionStillActive,
    nowIso: '2026-05-12T19:00:00Z',
  });
  assertEquals(r.blocks[0].isOngoing, true);
  assertEquals(r.diagnostics.blocksClamped, 0);
  assertEquals(r.diagnostics.blocksDropped, 0);
});
