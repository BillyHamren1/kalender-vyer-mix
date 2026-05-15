/**
 * Lager 3.11D — workdayEnvelope diagnostics
 *
 * Verifierar att diagnostics.workdayEnvelope innehåller alla fält och att
 * klipp-flaggorna sätts korrekt i typfallen:
 *   1) Stängd timer helt inom analysdagen → inga klipp.
 *   2) Öppen timer (ingen stop) → timerIsOpen=true + endWasClippedToNow=true.
 *   3) Timer som startade dagen innan → startWasClippedToDay=true
 *      + warning workday_started_before_analysis_day.
 *   4) Stängd timer som fortsätter över midnatt → endWasClippedToDay=true.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveWorkdayEnvelope } from './buildWorkdayAllocationFromLocationTruth.ts';

const dayStart = '2026-05-15T00:00:00.000Z';
const dayEnd = '2026-05-15T23:59:59.999Z';

Deno.test('3.11D #1 — stängd timer inom dagen → inga klipp', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { staffId: 's', date: '2026-05-15',
      startedAt: '2026-05-15T07:00:00.000Z', stoppedAt: '2026-05-15T16:00:00.000Z' },
    analysisWindowStartIso: dayStart,
    analysisWindowEndIso: dayEnd,
    nowIso: '2026-05-15T20:00:00.000Z',
  });
  assertEquals(env.startWasClippedToDay, false);
  assertEquals(env.endWasClippedToDay, false);
  assertEquals(env.endWasClippedToNow, false);
  assertEquals(env.isOpen, false);
  assertEquals(env.timerStartedAt, '2026-05-15T07:00:00.000Z');
  assertEquals(env.timerStoppedAt, '2026-05-15T16:00:00.000Z');
  assertEquals(env.effectiveWorkdayStartAt, '2026-05-15T07:00:00.000Z');
  assertEquals(env.effectiveWorkdayEndAt, '2026-05-15T16:00:00.000Z');
});

Deno.test('3.11D #2 — öppen timer mitt i dagen → endWasClippedToNow=true', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { staffId: 's', date: '2026-05-15',
      startedAt: '2026-05-15T07:00:00.000Z', stoppedAt: null },
    analysisWindowStartIso: dayStart,
    analysisWindowEndIso: dayEnd,
    nowIso: '2026-05-15T12:00:00.000Z',
  });
  assertEquals(env.isOpen, true);
  assertEquals(env.timerStoppedAt, null);
  assertEquals(env.endWasClippedToNow, true);
  assertEquals(env.endWasClippedToDay, false);
  assertEquals(env.effectiveWorkdayEndAt, '2026-05-15T12:00:00.000Z');
  assert(env.warnings.includes('workday_timer_open'));
});

Deno.test('3.11D #3 — timer från dagen innan → startWasClippedToDay=true + warning', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { staffId: 's', date: '2026-05-15',
      startedAt: '2026-05-14T22:00:00.000Z', stoppedAt: '2026-05-15T08:00:00.000Z' },
    analysisWindowStartIso: dayStart,
    analysisWindowEndIso: dayEnd,
    nowIso: '2026-05-15T10:00:00.000Z',
  });
  assertEquals(env.startWasClippedToDay, true);
  assertEquals(env.timerStartedAt, '2026-05-14T22:00:00.000Z');
  assertEquals(env.effectiveWorkdayStartAt, dayStart);
  assert(env.warnings.includes('workday_started_before_analysis_day'));
});

Deno.test('3.11D #4 — stängd timer löper över midnatt → endWasClippedToDay=true', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { staffId: 's', date: '2026-05-15',
      startedAt: '2026-05-15T20:00:00.000Z', stoppedAt: '2026-05-16T03:00:00.000Z' },
    analysisWindowStartIso: dayStart,
    analysisWindowEndIso: dayEnd,
    nowIso: '2026-05-16T05:00:00.000Z',
  });
  assertEquals(env.endWasClippedToDay, true);
  assertEquals(env.timerStoppedAt, '2026-05-16T03:00:00.000Z');
  assertEquals(env.effectiveWorkdayEndAt, dayEnd);
  assert(env.warnings.includes('workday_continues_after_analysis_day'));
});
