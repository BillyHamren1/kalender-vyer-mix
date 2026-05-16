/**
 * Lager 3.2 — Workday Envelope-tester.
 *
 * Verifierar att:
 *   1. resolveWorkdayEnvelope korrekt beskriver stängd dagtimer.
 *   2. Öppen dagtimer ger isOpen=true + warning workday_timer_open + endAt = analysisWindowEnd / now.
 *   3. Ingen dagtimer → no envelope, warning workday_start_missing.
 *   4. Segment utanför envelope blir outsideWorkday + warning.
 *   5. Diagnostics innehåller envelope-fält (workdayEnvelopeFound, openWorkday, source, etc).
 *   6. Hem inom envelope ger private_time + förslag (ingen auto-stop).
 *   7. workdayEndAt rapporteras null när timern är öppen.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWorkdayAllocationFromLocationTruth,
  resolveWorkdayEnvelope,
  type ActiveWorkdayInput,
} from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
} from './buildLocationTruthFromDayEvidence.ts';

function fakeLocationTruth(segments: LocationTruthSegment[], date = '2026-05-15'): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1',
      date,
      builtAtIso: '2026-05-15T00:00:00Z',
      buildDurationMs: 0,
      inputClusterCount: segments.length,
      outputSegmentCount: segments.length,
      warnings: [],
    } as any,
  } as LocationTruthResult;
}

function privateSeg(start: string, end: string): LocationTruthSegment {
  return {
    id: `priv-${start}`,
    staffId: 'staff-1',
    startAt: start,
    endAt: end,
    type: 'private_residence',
    finalType: 'private_residence',
    confidence: 'high',
    physicalLocation: { label: 'Hem', address: null },
    matchedTarget: undefined,
    businessContext: { status: 'private_residence', matchedTarget: undefined },
    evidence: { assignmentSupportsTarget: false } as any,
  } as any;
}

// ── 1. Stängd dagtimer ──────────────────────────────────────────────────
Deno.test('Layer 3.2 — closed workday → envelope startSource/endSource set, isOpen=false', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T07:00:00Z', stoppedAt: '2026-05-15T16:00:00Z' },
    analysisWindowEndIso: '2026-05-15T22:59:59Z',
  });
  assertEquals(env.isOpen, false);
  assertEquals(env.startSource, 'active_time_registration');
  assertEquals(env.endSource, 'active_time_registration_stop');
  assertEquals(env.startAt, '2026-05-15T07:00:00.000Z');
  assertEquals(env.endAt, '2026-05-15T16:00:00.000Z');
  assertEquals(env.warnings.length, 0);
});

// ── 2. Öppen dagtimer ───────────────────────────────────────────────────
Deno.test('Layer 3.2 — open workday → endAt = analysisWindowEnd, warning workday_timer_open', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T07:00:00Z', stoppedAt: null },
    analysisWindowEndIso: '2026-05-15T20:00:00Z',
    nowIso: '2026-05-16T05:00:00Z', // now > analysisWindowEnd
  });
  assertEquals(env.isOpen, true);
  assertEquals(env.endAt, '2026-05-15T20:00:00.000Z');
  assertEquals(env.endSource, 'analysis_window_end');
  assert(env.warnings.includes('workday_timer_open'));
});

Deno.test('Layer 3.2 — open workday + now < analysisWindowEnd → endAt = now', () => {
  const env = resolveWorkdayEnvelope({
    activeWorkday: { startedAt: '2026-05-15T07:00:00Z', stoppedAt: null },
    analysisWindowEndIso: '2026-05-15T22:59:59Z',
    nowIso: '2026-05-15T12:00:00Z',
  });
  assertEquals(env.isOpen, true);
  assertEquals(env.endAt, '2026-05-15T12:00:00.000Z');
  assertEquals(env.endSource, 'now');
  assert(env.warnings.includes('workday_timer_open'));
  assert(env.warnings.includes('envelope_clipped_to_analysis_window'));
});

// ── 3. Ingen dagtimer ───────────────────────────────────────────────────
Deno.test('Layer 3.2 — no workday → workday_start_missing, no envelope', () => {
  const env = resolveWorkdayEnvelope({ activeWorkday: { startedAt: null } });
  assertEquals(env.startAt, null);
  assertEquals(env.endAt, null);
  assertEquals(env.isOpen, false);
  assert(env.warnings.includes('workday_start_missing'));
});

// ── 4. Segment utanför envelope ─────────────────────────────────────────
Deno.test('Layer 3.2 — segment outside envelope → outsideWorkday + segment_outside_workday warning', () => {
  const seg = privateSeg('2026-05-15T03:00:00Z', '2026-05-15T05:00:00Z'); // före workday
  const lt = fakeLocationTruth([seg]);
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null,
    locationTruthV2: lt,
    workdayEnvelope: {
      startAt: '2026-05-15T07:00:00.000Z',
      endAt: '2026-05-15T16:00:00.000Z',
      isOpen: false,
      startSource: 'active_time_registration',
      endSource: 'active_time_registration_stop',
      warnings: [],
    },
  });
  assertEquals(wda.segments.length, 1);
  assertEquals(wda.segments[0].outsideWorkday, true);
  assert(wda.segments[0].warnings.includes('segment_outside_workday'));
  assertEquals(wda.diagnostics.segmentsOutsideEnvelope, 1);
  assertEquals(wda.diagnostics.segmentsInsideEnvelope, 0);
});

// ── 5. Diagnostics envelope-fält ────────────────────────────────────────
Deno.test('Layer 3.2 — diagnostics exposes envelope fields', () => {
  const lt = fakeLocationTruth([]);
  const wda = buildWorkdayAllocationFromLocationTruth({
    // Time Engine 3 — open timer kräver same-day evidence för synlig envelope.
    // Vi simulerar evidence här så att envelope-fälten rapporteras som tidigare.
    dayEvidence: { gps: { locationLogicPingCount: 10 } } as any,
    locationTruthV2: lt,
    workdayEnvelope: {
      startAt: '2026-05-15T07:00:00.000Z',
      endAt: '2026-05-15T20:00:00.000Z',
      isOpen: true,
      startSource: 'active_time_registration',
      endSource: 'analysis_window_end',
      warnings: ['workday_timer_open'],
    },
  });
  const d = wda.diagnostics;
  assertEquals(d.workdayEnvelopeFound, true);
  assertEquals(d.openWorkday, true);
  assertEquals(d.workdayStartSource, 'active_time_registration');
  assertEquals(d.workdayEndSource, 'analysis_window_end');
  assertEquals(d.workdayStartAt, '2026-05-15T07:00:00.000Z');
  // Öppen dagtimer → workdayEndAt rapporteras null (envelope-end är runtime-fönster).
  assertEquals(d.workdayEndAt, null);
  assert(d.envelopeWarnings.includes('workday_timer_open'));
});

// ── 6. Hem inom envelope ────────────────────────────────────────────────
Deno.test('Layer 3.2 — private_residence inside envelope → private_time + proposal, no auto-stop', () => {
  const seg = privateSeg('2026-05-15T15:00:00Z', '2026-05-15T15:45:00Z');
  const lt = fakeLocationTruth([seg]);
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null,
    locationTruthV2: lt,
    workdayEnvelope: {
      startAt: '2026-05-15T07:00:00.000Z',
      endAt: '2026-05-15T16:00:00.000Z',
      isOpen: false,
      startSource: 'active_time_registration',
      endSource: 'active_time_registration_stop',
      warnings: [],
    },
  });
  assertEquals(wda.segments.length, 1);
  assertEquals(wda.segments[0].allocationType, 'private_time');
  assert(wda.proposals.length >= 1, 'should produce at least one proposal');
  assertEquals(wda.proposals[0].proposedAllocationType, 'private_time');
  assertEquals(
    wda.proposals[0].reason,
    'private_residence_inside_active_workday_consider_workday_end',
  );
});

// ── 7. Bakåtkompatibilitet: ingen envelope skickas → resolvas internt ──
Deno.test('Layer 3.2 — backward compat: no envelope passed → resolved internally from activeWorkday', () => {
  const lt = fakeLocationTruth([]);
  const aw: ActiveWorkdayInput = {
    startedAt: '2026-05-15T07:00:00Z',
    stoppedAt: '2026-05-15T16:00:00Z',
    staffId: 'staff-1',
    date: '2026-05-15',
  };
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: null,
    locationTruthV2: lt,
    activeWorkday: aw,
  });
  assertEquals(wda.diagnostics.workdayEnvelopeFound, true);
  assertEquals(wda.diagnostics.openWorkday, false);
  assertEquals(wda.diagnostics.workdayEndSource, 'active_time_registration_stop');
  assertEquals(wda.diagnostics.workdayStartAt, '2026-05-15T07:00:00.000Z');
});
