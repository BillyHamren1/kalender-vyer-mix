// Time Engine 4.6 — commute distance + residence day-end policy tests
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeDayEndDecision,
  COMMUTE_DISTANCE_THRESHOLD_METERS,
} from '../computeDayEndDecision.ts';
import type { ReportCandidateBlock } from '../buildReportCandidateBlocks.ts';

const date = '2026-05-12';
const dayStart = '2026-05-11T22:00:00.000Z';
const dayEnd = '2026-05-12T21:59:59.999Z';

function workAutoClosed(p: {
  startAt: string;
  endAt: string;        // = leaveWorkAt
  autoClosedAt: string; // = residenceEnterAt
  lastConfirmedAt?: string;
}): ReportCandidateBlock {
  return {
    id: 'w1',
    kind: 'work',
    startAt: p.startAt,
    endAt: p.endAt,
    durationMinutes: 60,
    durationLabel: '1 h 0 min',
    title: 'Project',
    subtitle: '',
    targetType: 'project',
    targetId: 'p1',
    targetLabel: 'Project',
    confidence: 'high',
    confidenceReason: 'engine',
    reviewState: 'ok',
    reviewReasons: [],
    isOngoing: false,
    autoClosedByPrivateResidence: true,
    autoClosedAt: p.autoClosedAt,
    lastConfirmedAt: p.lastConfirmedAt ?? p.endAt,
    privateResidenceDurationMinutes: 95,
    evidenceSummary: {
      confirmedMinutes: 60, probableMinutes: 0, signalGapMinutes: 0,
      transportMinutes: 0, unknownMinutes: 0, presenceBlockCount: 1,
      suppressedSignalGapBlockCount: 0, suppressedUnknownBlockCount: 0,
      suppressedZeroLengthBlockCount: 0,
    } as any,
    sourcePresenceBlockIds: [],
    hiddenSignalGapIds: [],
    hiddenPresenceBlockIds: [],
    signalGapMinutes: 0,
    firstConfirmedAt: p.startAt,
  } as any;
}

function transport(startAt: string, endAt: string, distanceMeters: number): ReportCandidateBlock {
  return {
    id: `t-${startAt}`,
    kind: 'transport',
    startAt, endAt,
    durationMinutes: 30,
    durationLabel: '30 min',
    title: 'Resa',
    subtitle: '',
    targetType: null,
    targetId: null,
    targetLabel: null,
    confidence: 'medium',
    confidenceReason: 'gps',
    reviewState: 'ok',
    reviewReasons: [],
    isOngoing: false,
    evidenceSummary: {
      confirmedMinutes: 0, probableMinutes: 0, signalGapMinutes: 0,
      transportMinutes: 30, unknownMinutes: 0, presenceBlockCount: 0,
      suppressedSignalGapBlockCount: 0, suppressedUnknownBlockCount: 0,
      suppressedZeroLengthBlockCount: 0,
      distanceMeters,
    } as any,
    sourcePresenceBlockIds: [],
    hiddenSignalGapIds: [],
    hiddenPresenceBlockIds: [],
    signalGapMinutes: 0,
    firstConfirmedAt: startAt,
    lastConfirmedAt: endAt,
  } as any;
}

const openReg = {
  registrationId: 'r1',
  startedAtIso: '2026-05-12T07:00:00Z',
  targetType: 'project' as const,
  targetId: 'p1',
  targetLabel: 'Project',
  currentLabel: 'Project',
};

Deno.test('4.6 short commute (<150 km): day ends at leaveWorkAt, not at residenceEnter', () => {
  const work = workAutoClosed({
    startAt: '2026-05-12T07:00:00Z',
    endAt: '2026-05-12T16:00:00Z',        // leaveWorkAt
    lastConfirmedAt: '2026-05-12T16:00:00Z',
    autoClosedAt: '2026-05-12T16:30:00Z', // residenceEnterAt
  });
  const t = transport('2026-05-12T16:00:00Z', '2026-05-12T16:30:00Z', 50_000); // 50 km
  const r = computeDayEndDecision({
    date, dayStartUtcIso: dayStart, dayEndUtcIso: dayEnd,
    blocks: [work, t],
    activeRegistrations: [],
    openActiveRegistration: openReg,
    lastGpsPingAtIso: '2026-05-12T16:30:00Z',
    homeAnchors: [],
    nowIso: '2026-05-12T18:00:00Z',
  });
  assertEquals(r.dayEnded, true);
  assertEquals(r.endedAt, '2026-05-12T16:00:00Z');
  assertEquals(r.endReason, 'left_last_work_before_private_residence_commute');
});

Deno.test('4.6 long commute (>=150 km): day ends at residenceEnterAt', () => {
  const work = workAutoClosed({
    startAt: '2026-05-12T07:00:00Z',
    endAt: '2026-05-12T16:00:00Z',
    lastConfirmedAt: '2026-05-12T16:00:00Z',
    autoClosedAt: '2026-05-12T18:30:00Z',
  });
  const t = transport('2026-05-12T16:00:00Z', '2026-05-12T18:30:00Z', 200_000); // 200 km
  const r = computeDayEndDecision({
    date, dayStartUtcIso: dayStart, dayEndUtcIso: dayEnd,
    blocks: [work, t],
    activeRegistrations: [],
    openActiveRegistration: openReg,
    lastGpsPingAtIso: '2026-05-12T18:30:00Z',
    homeAnchors: [],
    nowIso: '2026-05-12T20:00:00Z',
  });
  assertEquals(r.dayEnded, true);
  assertEquals(r.endedAt, '2026-05-12T18:30:00Z');
  assertEquals(r.endReason, 'long_distance_homebound_travel');
});

Deno.test('4.6 threshold constant value is 150 km', () => {
  assertEquals(COMMUTE_DISTANCE_THRESHOLD_METERS, 150_000);
});

Deno.test('4.6 no transport between work and residence → treated as short commute (0 m)', () => {
  const work = workAutoClosed({
    startAt: '2026-05-12T07:00:00Z',
    endAt: '2026-05-12T16:00:00Z',
    lastConfirmedAt: '2026-05-12T16:00:00Z',
    autoClosedAt: '2026-05-12T16:10:00Z',
  });
  const r = computeDayEndDecision({
    date, dayStartUtcIso: dayStart, dayEndUtcIso: dayEnd,
    blocks: [work],
    activeRegistrations: [],
    openActiveRegistration: openReg,
    lastGpsPingAtIso: '2026-05-12T16:10:00Z',
    homeAnchors: [],
    nowIso: '2026-05-12T18:00:00Z',
  });
  assertEquals(r.endedAt, '2026-05-12T16:00:00Z');
  assertEquals(r.endReason, 'left_last_work_before_private_residence_commute');
  assert(r.evidence.some((e) => e.includes('commute_m=0')));
});
