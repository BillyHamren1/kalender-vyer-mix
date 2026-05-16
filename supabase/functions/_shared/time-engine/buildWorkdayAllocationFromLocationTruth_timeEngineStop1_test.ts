// Time Engine STOP 1 — tester för clamp av öppen/stale arbetsdag.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  buildWorkdayAllocationFromLocationTruth,
  type WorkdayEnvelope,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import type { LocationTruthResult } from './buildLocationTruthFromDayEvidence.ts';

const DAY = '2026-05-16';
const dayStart = `${DAY}T00:00:00.000Z`;
const dayEnd = `${DAY}T23:59:59.999Z`;

function envelope(opts: {
  start: string;
  stop?: string | null;
  isOpen?: boolean;
}): WorkdayEnvelope {
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
    analysisDayStartAt: dayStart,
    analysisDayEndAt: dayEnd,
    startWasClippedToDay: false,
    endWasClippedToDay: false,
    endWasClippedToNow: isOpen,
  };
}

interface SegInit {
  id: string;
  start: string;
  end: string;
  finalType: 'known_site' | 'private_residence' | 'movement' | 'unresolved_location';
  target?: { type: 'project' | 'warehouse' | 'private_zone'; id: string; label: string };
}

function ltResult(segs: SegInit[]): LocationTruthResult {
  return {
    segments: segs.map((s) => ({
      id: s.id,
      startAt: s.start,
      endAt: s.end,
      durationMinutes: Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000),
      finalType: s.finalType as any,
      confidence: 'high',
      evidence: { assignmentSupportsTarget: false } as any,
      businessContext: s.target
        ? {
            status: 'matched_eventflow_target',
            matchedTarget: { targetType: s.target.type as any, targetId: s.target.id, label: s.target.label },
          }
        : { status: 'no_target_match' as any },
      matchedTarget: s.target
        ? { targetType: s.target.type as any, targetId: s.target.id, label: s.target.label }
        : undefined,
      diagnostics: {} as any,
      physicalLocation: { label: s.target?.label ?? null } as any,
    })) as any,
    diagnostics: {
      staffId: 'staff-1',
      date: DAY,
    } as any,
    stableClusters: [] as any,
    clusterMatches: [] as any,
  };
}

// A: Jobb 08–15, hem 15:30–20, timer öppen → clamp till 15:00.
Deno.test('STOP 1 — A: home > 90m efter sista jobb → clamp till sista work-end', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T08:00:00Z`, end: `${DAY}T15:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt A' } },
    { id: 'm1', start: `${DAY}T15:00:00Z`, end: `${DAY}T15:30:00Z`, finalType: 'movement' },
    { id: 'h1', start: `${DAY}T15:30:00Z`, end: `${DAY}T20:00:00Z`,
      finalType: 'private_residence', target: { type: 'private_zone', id: 'home', label: 'Hem' } },
  ]);

  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 100 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });

  assertEquals(r.diagnostics.dayEndDecision?.dayEnded, true);
  assertEquals(r.diagnostics.dayEndDecision?.endReason, 'home_after_last_work_over_90m');
  assertEquals(r.diagnostics.dayEndDecision?.endedAt, `${DAY}T15:00:00.000Z`);
  assertEquals(r.diagnostics.workdayEnvelope.openTimerIgnoredAfterEnd, true);
  assertEquals(r.diagnostics.workdayEndAt, `${DAY}T15:00:00.000Z`);
});

// B: Jobb till 16, okänd plats 16:30–19:00 → clamp.
Deno.test('STOP 1 — B: okänd stabil plats > 90m → clamp', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T10:00:00Z`, end: `${DAY}T16:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt A' } },
    { id: 'u1', start: `${DAY}T16:30:00Z`, end: `${DAY}T19:00:00Z`,
      finalType: 'unresolved_location' },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 50 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T10:00:00Z`, isOpen: true }),
  });
  assertEquals(r.diagnostics.dayEndDecision?.dayEnded, true);
  assertEquals(r.diagnostics.dayEndDecision?.endReason, 'non_work_location_after_last_work_over_90m');
  assertEquals(r.diagnostics.workdayEndAt, `${DAY}T16:00:00.000Z`);
});

// C: Jobb 10–15, lager 16–18 → ingen clamp (lager räknas som work).
Deno.test('STOP 1 — C: lager efter jobb räknas som work, ingen clamp', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T10:00:00Z`, end: `${DAY}T15:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt' } },
    { id: 'w2', start: `${DAY}T16:00:00Z`, end: `${DAY}T18:00:00Z`,
      finalType: 'known_site', target: { type: 'warehouse', id: 'wh1', label: 'Lager' } },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 50 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T10:00:00Z`, stop: `${DAY}T18:00:00Z` }),
  });
  assertEquals(r.diagnostics.dayEndDecision?.dayEnded ?? false, false);
});

// D: Lunch 30 min privat mitt på dagen → ingen clamp.
Deno.test('STOP 1 — D: kort lunch <90m + work efteråt → ingen clamp', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T08:00:00Z`, end: `${DAY}T11:30:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt' } },
    { id: 'h1', start: `${DAY}T11:30:00Z`, end: `${DAY}T12:15:00Z`,
      finalType: 'private_residence', target: { type: 'private_zone', id: 'home', label: 'Hem' } },
    { id: 'w2', start: `${DAY}T12:30:00Z`, end: `${DAY}T16:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt' } },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 100 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, stop: `${DAY}T16:00:00Z` }),
  });
  assertEquals(r.diagnostics.dayEndDecision?.dayEnded ?? false, false);
});

// E: open timer + 0 pings/segment → suppress (Time Engine 3 redan).
Deno.test('STOP 1 — E: open timer utan evidence → suppressed, ingen dayEndDecision', () => {
  const lt = ltResult([]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 0 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });
  // Time Engine 3 suppress vinner (returnerar tidigt).
  assertEquals(r.diagnostics.hasActiveWorkday, false);
  assertEquals(r.diagnostics.warnings.includes('open_timer_without_same_day_evidence'), true);
});

// F: Endast hem hela dagen efter "sista jobb" (utan jobb) → clamp via no_work_evidence.
Deno.test('STOP 1 — F: bara hem efter timer-start utan jobb-evidence → clamp', () => {
  const lt = ltResult([
    { id: 'h1', start: `${DAY}T08:30:00Z`, end: `${DAY}T20:00:00Z`,
      finalType: 'private_residence', target: { type: 'private_zone', id: 'home', label: 'Hem' } },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 200 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });
  assertEquals(r.diagnostics.dayEndDecision?.dayEnded, true);
  assertEquals(r.diagnostics.dayEndDecision?.endReason, 'no_work_evidence_after_last_work_over_90m');
  assertEquals(r.diagnostics.workdayEnvelope.openTimerIgnoredAfterEnd, true);
});

// ─── STOP 1.1 — clamp appliceras FÖRE allocation-loopen ───────────────────

// 1.1-A: Hem efter sista jobb → segment efter clamp blir outsideWorkday,
//        ingen uncovered gap, inget private_time displayblock i workday,
//        suggest_workday_end-proposal emitteras alltid.
Deno.test('STOP 1.1 — A: home efter clamp blir outsideWorkday, ingen uncovered gap', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T08:00:00Z`, end: `${DAY}T15:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt A' } },
    { id: 'h1', start: `${DAY}T15:30:00Z`, end: `${DAY}T20:00:00Z`,
      finalType: 'private_residence', target: { type: 'private_zone', id: 'home', label: 'Hem' } },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 100 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });

  // STOP 1.1: clampedBeforeAllocation måste vara true.
  assertEquals(r.diagnostics.workdayEnvelope.clampedBeforeAllocation, true);
  assertEquals(r.diagnostics.workdayEndAt, `${DAY}T15:00:00.000Z`);

  // Home-segmentet (h1) ska vara outsideWorkday – inte ett private_time-block i workday.
  const h1 = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('h1'));
  assertEquals(h1?.outsideWorkday, true);

  // Inga segment efter clamp får vara insideWorkday.
  const clampMs = Date.parse(`${DAY}T15:00:00.000Z`);
  for (const s of r.segments) {
    if (Date.parse(s.startAt) >= clampMs) {
      assertEquals(s.outsideWorkday, true);
    }
  }

  // Inga uncovered gap-proposals efter inferred end.
  const gapsAfterEnd = r.proposals.filter(
    (p) => p.proposalType === 'uncovered_workday_time' &&
           Date.parse(p.startAt) >= clampMs,
  );
  assertEquals(gapsAfterEnd.length, 0);

  // uncoveredWorkdayMinutes ska inte räkna in 15:00–20:00.
  assertEquals(r.diagnostics.uncoveredWorkdayMinutes <= 30, true);

  // STOP 1.1: suggest_workday_end-proposal måste finnas (Layer 3.6 skippas).
  const sweProposals = r.proposals.filter((p) => p.proposalType === 'suggest_workday_end');
  assertEquals(sweProposals.length >= 1, true);

  // Counters för ignorerade segment.
  assertEquals(
    (r.diagnostics.workdayEnvelope.segmentsIgnoredAfterInferredDayEnd ?? 0) >= 1,
    true,
  );
});

// 1.1-B: Okänd plats efter sista jobb → ingen unlinked_work_address/review,
//        inga Gantt-block efter clamp.
Deno.test('STOP 1.1 — B: okänd plats efter clamp blir inte review/unlinked_work_address', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T10:00:00Z`, end: `${DAY}T16:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt A' } },
    { id: 'u1', start: `${DAY}T16:30:00Z`, end: `${DAY}T19:00:00Z`,
      finalType: 'unresolved_location' },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 50 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T10:00:00Z`, isOpen: true }),
  });

  assertEquals(r.diagnostics.workdayEnvelope.clampedBeforeAllocation, true);
  assertEquals(r.diagnostics.workdayEndAt, `${DAY}T16:00:00.000Z`);

  // u1 efter clamp → outsideWorkday, INTE unlinked_work_address inside workday.
  const u1 = r.segments.find((s) => s.sourceLocationTruthSegmentIds.includes('u1'));
  assertEquals(u1?.outsideWorkday, true);

  // Inga insideWorkday-segment med review eller unlinked_work_address efter clamp.
  const clampMs = Date.parse(`${DAY}T16:00:00.000Z`);
  const reviewAfter = r.segments.filter(
    (s) => !s.outsideWorkday &&
           Date.parse(s.startAt) >= clampMs &&
           (s.allocationType === 'unlinked_work_address' ||
            s.allocationType === 'needs_work_allocation_review'),
  );
  assertEquals(reviewAfter.length, 0);

  // Inga uncovered_workday_time-proposals efter clamp.
  const gapsAfter = r.proposals.filter(
    (p) => p.proposalType === 'uncovered_workday_time' &&
           Date.parse(p.startAt) >= clampMs,
  );
  assertEquals(gapsAfter.length, 0);
});

// 1.1-C: Lunch <90 min mitt på dagen och jobb efteråt → ingen clamp.
Deno.test('STOP 1.1 — C: kort lunch + jobb efteråt → ingen clamp, allocation körs normalt', () => {
  const lt = ltResult([
    { id: 'w1', start: `${DAY}T08:00:00Z`, end: `${DAY}T11:30:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt A' } },
    { id: 'lunch', start: `${DAY}T11:30:00Z`, end: `${DAY}T12:30:00Z`,
      finalType: 'private_residence', target: { type: 'private_zone', id: 'home', label: 'Hem' } },
    { id: 'w2', start: `${DAY}T12:30:00Z`, end: `${DAY}T16:00:00Z`,
      finalType: 'known_site', target: { type: 'project', id: 'p1', label: 'Projekt A' } },
  ]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 200 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({
      start: `${DAY}T08:00:00Z`,
      stop: `${DAY}T16:00:00Z`,
      isOpen: false,
    }),
  });

  assertEquals(r.diagnostics.workdayEnvelope.clampedBeforeAllocation, false);
  assertEquals(r.diagnostics.dayEndDecision, null);
  // Alla LT-segment ska vara insideWorkday.
  const inside = r.segments.filter((s) => !s.outsideWorkday);
  assertEquals(inside.length, 3);
});

// 1.1-D: Open timer utan pings/LT → suppressed (ärvt från STOP 1) – ingen
//        display/gantt/dayEndDecision.
Deno.test('STOP 1.1 — D: open timer utan evidence → suppressed, inga allocation-segment', () => {
  const lt = ltResult([]);
  const r = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { gps: { locationLogicPingCount: 0 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: envelope({ start: `${DAY}T08:00:00Z`, isOpen: true }),
  });
  assertEquals(r.diagnostics.hasActiveWorkday, false);
  assertEquals(r.segments.length, 0);
  assertEquals(r.diagnostics.dayEndDecision ?? null, null);
});
