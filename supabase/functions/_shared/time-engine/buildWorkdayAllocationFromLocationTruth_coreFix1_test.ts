// Time Engine Core Fix 1 — guard när raw GPS finns men LocationTruth V2 saknas.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  buildWorkdayAllocationFromLocationTruth,
  type WorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import { buildDisplayTimelineFromWorkdayAllocation } from './buildDisplayTimelineFromWorkdayAllocation.ts';

const DAY = '2026-05-16';

function envelope(opts: { start: string; isOpen?: boolean; stop?: string | null }): WorkdayEnvelope {
  const isOpen = opts.isOpen ?? !opts.stop;
  return {
    startAt: opts.start,
    endAt: opts.stop ?? `${DAY}T22:00:00.000Z`,
    isOpen,
    startSource: 'active_time_registration',
    endSource: isOpen ? 'now' : 'active_time_registration_stop',
    warnings: [],
    timerStartedAt: opts.start,
    timerStoppedAt: opts.stop ?? null,
    effectiveWorkdayStartAt: opts.start,
    effectiveWorkdayEndAt: opts.stop ?? `${DAY}T22:00:00.000Z`,
    analysisDayStartAt: `${DAY}T00:00:00.000Z`,
    analysisDayEndAt: `${DAY}T23:59:59.999Z`,
    startWasClippedToDay: false,
    endWasClippedToDay: false,
    endWasClippedToNow: isOpen,
  };
}

// A: 500 raw pings men 0 LocationTruth → ingen allocation, inget display.
Deno.test('Core Fix 1 — A: raw pings finns men LT V2 = 0 → engine blockerad', () => {
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { rawPingCount: 500, locationLogicPingCount: 0 } } as any,
    locationTruthV2: { segments: [], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });

  assertEquals(r.diagnostics.engineBlockedBecauseLocationTruthMissing, true);
  assertEquals(r.diagnostics.hasRawPingsButNoLocationTruth, true);
  assertEquals(r.diagnostics.hasActiveWorkday, false);
  assertEquals(r.segments.length, 0);
  assertEquals(r.proposals.length, 0);
  assertEquals(r.diagnostics.uncoveredWorkdayMinutes, 0);
  assertEquals(
    r.diagnostics.warnings.includes('raw_pings_exist_but_location_truth_missing'),
    true,
  );

  // DisplayTimeline ska suppressas helt.
  const dt = buildDisplayTimelineFromWorkdayAllocation({
    dayEvidence: { gps: { rawPingCount: 500 } } as any,
    locationTruthV2: { segments: [], diagnostics: {} } as any,
    workdayAllocation: r,
  });
  assertEquals(dt.blocks.length, 0);
  assertEquals(
    (dt.diagnostics.warnings as string[]).includes(
      'display_suppressed_because_missing_location_truth',
    ),
    true,
  );
});

// B: Open timer + 0 raw pings + 0 LT → existerande TE3-suppression gäller (ingen
//    heldagsworkday, inget 1260 min glapp). Core Fix 1-guarden triggar inte här
//    eftersom raw=0.
Deno.test('Core Fix 1 — B: open timer + 0 raw + 0 LT → ingen renderbar workday', () => {
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { rawPingCount: 0, locationLogicPingCount: 0 } } as any,
    locationTruthV2: { segments: [], diagnostics: { staffId: 's1', date: DAY } } as any,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });
  assertEquals(r.diagnostics.hasActiveWorkday, false);
  assertEquals(r.segments.length, 0);
  assertEquals(r.diagnostics.uncoveredWorkdayMinutes, 0);
  assertEquals(
    r.diagnostics.warnings.includes('open_timer_without_same_day_evidence'),
    true,
  );
  // Engine blockerades inte (raw=0) — det är TE3 som suppressar.
  assertEquals(r.diagnostics.engineBlockedBecauseLocationTruthMissing ?? false, false);
});

// C: raw pings + LT-segment finns → guard triggar INTE.
Deno.test('Core Fix 1 — C: raw + LT finns → ingen guard, allocation körs', () => {
  const lt = {
    segments: [{
      id: 'seg1',
      startAt: `${DAY}T09:00:00Z`,
      endAt: `${DAY}T12:00:00Z`,
      finalType: 'known_site',
      confidence: 'high',
      evidence: { assignmentSupportsTarget: false },
      businessContext: { status: 'matched_eventflow_target',
        matchedTarget: { targetType: 'project', targetId: 'p1', label: 'Projekt' } },
      matchedTarget: { targetType: 'project', targetId: 'p1', label: 'Projekt' },
      diagnostics: {},
      physicalLocation: { label: 'Projekt' },
    }],
    diagnostics: { staffId: 's1', date: DAY },
  } as any;
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { rawPingCount: 200, locationLogicPingCount: 150 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, stop: `${DAY}T17:00:00Z` }),
  });
  assertEquals(r.diagnostics.engineBlockedBecauseLocationTruthMissing ?? false, false);
  assertEquals(r.segments.length, 1);
});
