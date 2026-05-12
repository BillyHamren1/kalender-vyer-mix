// Time Engine 3.2 — DayEndDecision tests
// deno-lint-ignore-file no-explicit-any
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeDayEndDecision } from '../computeDayEndDecision.ts';

const DATE = '2026-05-12';
const DAY_START = '2026-05-11T22:00:00.000Z'; // CEST → 00:00 Stockholm
const DAY_END = '2026-05-12T21:59:59.999Z';

function block(over: Partial<any> = {}): any {
  return {
    id: 'b1', kind: 'work',
    startAt: '2026-05-12T07:00:00.000Z',
    endAt: '2026-05-12T15:00:00.000Z',
    durationMinutes: 480, durationLabel: '8h', title: '', subtitle: '',
    targetType: 'project', targetId: 'p1', targetLabel: 'Proj',
    fromLabel: null, toLabel: null,
    confidence: 'high', reviewState: 'ok', reviewReasons: [], warningLabel: null,
    evidenceSummary: { confirmedMinutes: 480, probableMinutes: 0, signalGapMinutes: 0, transportMinutes: 0, unknownMinutes: 0, presenceBlockCount: 1, suppressedSignalGapBlockCount: 0, suppressedUnknownBlockCount: 0, suppressedZeroLengthBlockCount: 0 },
    sourcePresenceBlockIds: [], hiddenSignalGapIds: [], hiddenPresenceBlockIds: [],
    signalGapMinutes: 0,
    firstConfirmedAt: '2026-05-12T07:00:00.000Z',
    lastConfirmedAt: '2026-05-12T15:00:00.000Z',
    ...over,
  };
}

Deno.test('manual stop ends day with high confidence', () => {
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [block()],
    activeRegistrations: [{ id: 'r1', startedAt: '2026-05-12T07:00:00.000Z', stoppedAt: '2026-05-12T15:00:00.000Z', stopSource: 'manual_stop' }],
    openActiveRegistration: null,
    lastGpsPingAtIso: '2026-05-12T15:00:00.000Z',
    homeAnchors: [],
    nowIso: '2026-05-12T22:30:00.000Z',
  });
  assertEquals(r.dayEnded, true);
  assertEquals(r.endReason, 'manual_stop');
  assertEquals(r.confidence, 'high');
  assertEquals(r.endedAt, '2026-05-12T15:00:00.000Z');
});

Deno.test('admin stop is recognized', () => {
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [block()],
    activeRegistrations: [{ id: 'r1', startedAt: '2026-05-12T07:00:00.000Z', stoppedAt: '2026-05-12T16:00:00.000Z', stopSource: 'admin_force_stop' }],
    openActiveRegistration: null,
    lastGpsPingAtIso: '2026-05-12T16:00:00.000Z',
    homeAnchors: [],
    nowIso: '2026-05-12T22:30:00.000Z',
  });
  assertEquals(r.endReason, 'admin_stop');
});

Deno.test('historical day with no open timer → report_day_ended at last evidence', () => {
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [block()],
    activeRegistrations: [],
    openActiveRegistration: null,
    lastGpsPingAtIso: '2026-05-12T15:30:00.000Z',
    homeAnchors: [],
    nowIso: '2026-05-15T10:00:00.000Z', // historical
  });
  assertEquals(r.dayEnded, true);
  assertEquals(r.endReason, 'report_day_ended');
  assertEquals(r.endedAt, '2026-05-12T15:00:00.000Z');
});

Deno.test('historical day NEVER uses Date.now (clamped to dayEndUtcIso)', () => {
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [],
    activeRegistrations: [],
    openActiveRegistration: { registrationId: 'r1', startedAtIso: '2026-05-12T08:00:00.000Z', targetType: null, targetId: null, targetLabel: null },
    lastGpsPingAtIso: '2026-05-12T08:30:00.000Z',
    homeAnchors: [],
    nowIso: '2026-05-20T10:00:00.000Z',
  });
  // Open timer + stale evidence on a historical day → ends at last fresh evidence,
  // NOT carried forward to "now".
  assert(r.dayEnded);
  assert(r.endedAt !== null && r.endedAt <= DAY_END);
  assertEquals(r.diagnostic, 'active_timer_open_but_not_enough_engine_evidence');
});

Deno.test('open timer alone does NOT keep the day alive without fresh evidence', () => {
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [block({ endAt: '2026-05-12T10:00:00.000Z', lastConfirmedAt: '2026-05-12T10:00:00.000Z', durationMinutes: 180 })],
    activeRegistrations: [{ id: 'r1', startedAt: '2026-05-12T07:00:00.000Z' }],
    openActiveRegistration: { registrationId: 'r1', startedAtIso: '2026-05-12T07:00:00.000Z', targetType: null, targetId: null, targetLabel: null },
    lastGpsPingAtIso: '2026-05-12T10:00:00.000Z',
    homeAnchors: [],
    nowIso: '2026-05-12T18:00:00.000Z', // 8h after last evidence, today
  });
  assertEquals(r.dayEnded, true);
  assertEquals(r.endReason, 'no_fresh_evidence_after_last_work');
  assertEquals(r.diagnostic, 'active_timer_open_but_not_enough_engine_evidence');
  assertEquals(r.endedAt, '2026-05-12T10:00:00.000Z');
});

Deno.test('open timer with fresh evidence → still_active', () => {
  const nowIso = '2026-05-12T15:10:00.000Z';
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [block({ lastConfirmedAt: '2026-05-12T15:00:00.000Z' })],
    activeRegistrations: [{ id: 'r1', startedAt: '2026-05-12T07:00:00.000Z' }],
    openActiveRegistration: { registrationId: 'r1', startedAtIso: '2026-05-12T07:00:00.000Z', targetType: null, targetId: null, targetLabel: null },
    lastGpsPingAtIso: '2026-05-12T15:05:00.000Z',
    homeAnchors: [],
    nowIso,
  });
  assertEquals(r.dayEnded, false);
  assertEquals(r.endReason, 'still_active');
});

Deno.test('private_residence auto-close ends the day', () => {
  const r = computeDayEndDecision({
    date: DATE, dayStartUtcIso: DAY_START, dayEndUtcIso: DAY_END,
    blocks: [block({
      isOngoing: false,
      autoClosedByPrivateResidence: true,
      autoClosedAt: '2026-05-12T14:30:00.000Z',
      privateResidenceDurationMinutes: 120,
    })],
    activeRegistrations: [{ id: 'r1', startedAt: '2026-05-12T07:00:00.000Z' }],
    openActiveRegistration: { registrationId: 'r1', startedAtIso: '2026-05-12T07:00:00.000Z', targetType: null, targetId: null, targetLabel: null },
    lastGpsPingAtIso: '2026-05-12T14:30:00.000Z',
    homeAnchors: [{ lat: 59.3, lng: 18.0, radiusM: 200 }],
    nowIso: '2026-05-12T18:00:00.000Z',
  });
  assertEquals(r.dayEnded, true);
  assertEquals(r.endReason, 'private_residence_after_last_work');
  assertEquals(r.endedAt, '2026-05-12T14:30:00.000Z');
  assertEquals(r.confidence, 'high');
});
