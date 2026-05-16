// Fix A — Öppen timer utan same-day evidence får inte skapa "Glapp i dagen".
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  buildWorkdayAllocationFromLocationTruth,
  type WorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import { buildDisplayTimelineFromWorkdayAllocation } from './buildDisplayTimelineFromWorkdayAllocation.ts';

const DAY = '2026-05-17';

function openTimerFromYesterday(): WorkdayEnvelope {
  // Timer startad igår, fortfarande öppen idag — klippt till analysdagens 00:00.
  return {
    startAt: `${DAY}T00:00:00.000Z`,
    endAt: `${DAY}T23:00:00.000Z`,
    isOpen: true,
    startSource: 'active_time_registration',
    endSource: 'analysis_day_end',
    warnings: ['open_timer_started_before_analysis_day'],
    timerStartedAt: '2026-05-16T15:00:00Z',
    timerStoppedAt: null,
    effectiveWorkdayStartAt: `${DAY}T00:00:00.000Z`,
    effectiveWorkdayEndAt: `${DAY}T23:00:00.000Z`,
    analysisDayStartAt: `${DAY}T00:00:00.000Z`,
    analysisDayEndAt: `${DAY}T23:59:59.999Z`,
    startWasClippedToDay: true,
    endWasClippedToDay: false,
    endWasClippedToNow: true,
  } as any;
}

Deno.test('Fix A — open timer + 0 evidence ger ingen allocation', () => {
  const wda = buildWorkdayAllocationFromLocationTruth({
    workdayEnvelope: openTimerFromYesterday(),
    locationTruthV2: {
      segments: [],
      diagnostics: { staffId: 'raivis', date: DAY } as any,
    } as any,
    dayEvidence: {
      gps: { rawPingCount: 0, locationLogicPingCount: 0 },
      assignments: { items: [] },
    } as any,
  } as any);

  const d: any = wda.diagnostics;
  assertEquals(wda.segments.length, 0, 'segments måste vara tomma');
  assertEquals(wda.proposals.length, 0, 'proposals måste vara tomma');
  assertEquals(d.hasActiveWorkday, false);
  assertEquals(d.workdayEnvelopeFound, false);
  assertEquals(d.uncoveredWorkdayMinutes, 0);
  assertEquals(d.uncoveredGapCount, 0);
  assertEquals(d.uncoveredGapsProposedCount, 0);
  assertEquals(d.openTimerIgnoredForDisplay, true);
  assert(
    d.warnings.includes('open_timer_without_same_day_evidence'),
    'måste flagga open_timer_without_same_day_evidence',
  );
});

Deno.test('Fix A — display suppressas → inga Gantt-block, ingen "Glapp i dagen"', () => {
  const wda = buildWorkdayAllocationFromLocationTruth({
    workdayEnvelope: openTimerFromYesterday(),
    locationTruthV2: {
      segments: [],
      diagnostics: { staffId: 'raivis', date: DAY } as any,
    } as any,
    dayEvidence: {
      gps: { rawPingCount: 0, locationLogicPingCount: 0 },
      assignments: { items: [] },
    } as any,
  } as any);

  const display = buildDisplayTimelineFromWorkdayAllocation({
    workdayAllocation: wda,
  } as any);

  assertEquals(display.blocks.length, 0, 'inga display-block får skapas');
  const breakBlocks = display.blocks.filter((b: any) => b.displayType === 'break_or_gap');
  assertEquals(breakBlocks.length, 0, 'ingen "Glapp i dagen"');
  assert(
    (display.diagnostics.warnings as string[]).includes(
      'display_suppressed_open_timer_without_evidence',
    ),
    'display ska ha suppress-warning',
  );
});
