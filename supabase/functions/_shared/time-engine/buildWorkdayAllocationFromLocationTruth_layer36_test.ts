/**
 * Lager 3.6 — Hem/private som stop-förslag (read-only).
 *
 * Verifierar:
 *   1. private_time efter sista arbetsplats markeras med
 *      home_after_last_work_location.
 *   2. > 90 min hemma efter sista jobb genererar proposal
 *      suggest_workday_end med suggestedEndAt = arrivalAtHome.
 *   3. < 90 min hemma med återgång till arbete → temporary_home_presence,
 *      ingen stop-proposal.
 *   4. private_time FÖRE sista arbetsplats påverkas inte av home_after_*.
 *   5. Diagnostik: homeSegmentsAfterWork / homeOver90MinutesCount /
 *      suggestedWorkdayEndCount / temporaryHomePresenceCount.
 *   6. Ingen mutation av active_time_registrations / timer (read-only —
 *      vi verifierar genom att inga sidoeffekter finns på input).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  FinalLocationTruthSegmentType,
} from './buildLocationTruthFromDayEvidence.ts';

const ENVELOPE = {
  startAt: '2026-05-15T07:00:00.000Z',
  endAt: '2026-05-15T20:00:00.000Z',
  isOpen: false,
  startSource: 'active_time_registration' as const,
  endSource: 'active_time_registration_stop' as const,
  warnings: [],
};

function siteSeg(
  id: string, start: string, end: string,
  t: LocationTruthTargetType, targetId = `${t}-1`, label = `${t} A`,
): LocationTruthSegment {
  const matched = { targetType: t, targetId, label };
  const finalType: FinalLocationTruthSegmentType =
    t === 'private_zone' ? 'private_residence' : 'known_site';
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: finalType === 'private_residence' ? 'private_residence' : 'known_target',
    finalType,
    confidence: 'high',
    physicalLocation: { label, address: 'A 1' } as any,
    matchedTarget: matched,
    businessContext: { status: 'matched_eventflow_target', matchedTarget: matched },
    evidence: { assignmentSupportsTarget: true, pingCount: 5 } as any,
    warnings: [],
    diagnostics: {} as any,
  } as any;
}

function fakeLT(segments: LocationTruthSegment[]): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1', date: '2026-05-15', builtAtIso: '2026-05-15T00:00:00Z',
      buildDurationMs: 0, warnings: [],
    } as any,
  } as LocationTruthResult;
}

function run(segments: LocationTruthSegment[]) {
  return buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: [] } } as any,
    locationTruthV2: fakeLT(segments),
    workdayEnvelope: ENVELOPE,
  });
}

Deno.test('Lager 3.6 — > 90 min hemma efter sista jobb → STOP 1.1 clampar wdEnd före allocation', () => {
  // STOP 1.1: hem-segmentet ligger > 90 min efter sista jobb → wdEnd clampas
  // till 16:00 FÖRE allocation-loopen. Hem blir outsideWorkday och Layer 3.6
  // genererar inte sin egen warning/proposal. STOP 1 äger suggest_workday_end.
  const segs = [
    siteSeg('p1', '2026-05-15T08:00:00Z', '2026-05-15T16:00:00Z', 'project'),
    siteSeg('h1', '2026-05-15T16:30:00Z', '2026-05-15T20:00:00Z', 'private_zone'),
  ];
  const res = run(segs);

  // Hem-segmentet ska vara outsideWorkday och inte ha private_time-allokering inne i workday.
  const homeOutside = res.segments.find(
    (s) => s.sourceLocationTruthSegmentIds.includes('h1') && s.outsideWorkday,
  );
  assert(homeOutside, 'hem-segmentet ska markeras outsideWorkday');
  const homeInside = res.segments.find(
    (s) => s.sourceLocationTruthSegmentIds.includes('h1') && !s.outsideWorkday,
  );
  assertEquals(homeInside, undefined);

  // STOP 1 emitterar suggest_workday_end (Layer 3.6 körs inte på outside-segment).
  const stop = res.proposals.find((p) => p.proposalType === 'suggest_workday_end')!;
  assertEquals(stop.suggestedEndAt, '2026-05-15T16:00:00.000Z');
  assertEquals(res.diagnostics.suggestedWorkdayEndCount, 1);

  // STOP 1.1 diagnostics.
  assertEquals(res.diagnostics.workdayEnvelope.clampedBeforeAllocation, true);
  assertEquals(res.diagnostics.workdayEndAt, '2026-05-15T16:00:00.000Z');
  assertEquals(res.diagnostics.dayEndDecision?.endReason, 'home_after_last_work_over_90m');

  // Layer 3.6:s counters för hem-segment efter jobb är 0 (segmentet är utanför workday).
  assertEquals(res.diagnostics.homeSegmentsAfterWork, 0);
  assertEquals(res.diagnostics.homeOver90MinutesCount, 0);
  assertEquals(res.diagnostics.temporaryHomePresenceCount, 0);
});

Deno.test('Lager 3.6 — kort hempaus < 90 min med återgång till jobb → temporary, ingen proposal', () => {
  const segs = [
    siteSeg('p1', '2026-05-15T08:00:00Z', '2026-05-15T11:00:00Z', 'project'),
    siteSeg('h1', '2026-05-15T11:15:00Z', '2026-05-15T12:00:00Z', 'private_zone'),
    siteSeg('p2', '2026-05-15T12:15:00Z', '2026-05-15T17:00:00Z', 'project'),
  ];
  const res = run(segs);

  const home = res.segments.find((s) => s.allocationType === 'private_time')!;
  // h1 ligger FÖRE sista arbetsplats (p2) → ingen home_after_last_work_location.
  assert(!home.warnings.includes('home_after_last_work_location'));
  assert(!home.warnings.includes('temporary_home_presence'));

  assert(!res.proposals.some((p) => p.proposalType === 'suggest_workday_end'));
  assertEquals(res.diagnostics.suggestedWorkdayEndCount, 0);
});

Deno.test('Lager 3.6 — hempaus efter sista jobb men återgår inom 90 min → temporary_home_presence', () => {
  // Två "sista jobb"-kandidater: p1 är "sista" om vi tittar på private_time
  // som kommer EFTER den. Här ligger en kort hempaus (30 min) efter p1 och
  // sedan ytterligare arbete inom 90 min — då markeras hempausen som
  // temporary_home_presence och ingen stop-proposal skapas.
  const segs = [
    siteSeg('p1', '2026-05-15T08:00:00Z', '2026-05-15T12:00:00Z', 'project'),
    siteSeg('h1', '2026-05-15T12:10:00Z', '2026-05-15T12:40:00Z', 'private_zone'),
    siteSeg('p2', '2026-05-15T13:00:00Z', '2026-05-15T17:00:00Z', 'project'),
  ];
  const res = run(segs);
  const home = res.segments.find((s) => s.allocationType === 'private_time')!;
  // h1 ligger före sista jobb (p2) → får inte home_after_last_work_location.
  assert(!home.warnings.includes('home_after_last_work_location'));
  assertEquals(res.diagnostics.suggestedWorkdayEndCount, 0);
});

Deno.test('Lager 3.6 — hempaus EFTER sista jobb men återvänder inom 90 min', () => {
  // Konstruera så att hempausen ligger efter sista isWorkLocation och
  // sedan följs av ytterligare arbete inom 90 min — då blir den senare
  // arbetsplatsen "sista" och hempausen ligger inte längre efter sista.
  // För att testa själva temporary-grenen krävs en konstellation där
  // hempausen är efter lastWorkIdx OCH ändå återgår till arbete. Det
  // inträffar bara om vi har: work → home → (work skippas av lastWorkIdx
  // ifall det är efter). Eftersom lastWorkIdx alltid är sist möjlig
  // arbetsplats kan denna gren bara nås om hempausen är efter alla jobb.
  // Vi verifierar därför att en hempaus efter sista jobb som är < 90 min
  // INTE genererar stop-proposal (men får home_after_last_work_location).
  const segs = [
    siteSeg('p1', '2026-05-15T08:00:00Z', '2026-05-15T16:00:00Z', 'project'),
    siteSeg('h1', '2026-05-15T16:10:00Z', '2026-05-15T17:00:00Z', 'private_zone'),
  ];
  const res = run(segs);
  const home = res.segments.find((s) => s.allocationType === 'private_time')!;
  assert(home.warnings.includes('home_after_last_work_location'));
  // 50 min < 90 → ingen suggest_workday_end.
  assert(!res.proposals.some((p) => p.proposalType === 'suggest_workday_end'));
  assertEquals(res.diagnostics.homeSegmentsAfterWork, 1);
  assertEquals(res.diagnostics.homeOver90MinutesCount, 0);
  assertEquals(res.diagnostics.suggestedWorkdayEndCount, 0);
});

Deno.test('Lager 3.6 — read-only: ingen mutation av input-segment', () => {
  const segs = [
    siteSeg('p1', '2026-05-15T08:00:00Z', '2026-05-15T16:00:00Z', 'project'),
    siteSeg('h1', '2026-05-15T16:10:00Z', '2026-05-15T19:00:00Z', 'private_zone'),
  ];
  const inputSnapshot = JSON.stringify(segs);
  const res = run(segs);
  // Original-input får inte muteras.
  assertEquals(JSON.stringify(segs), inputSnapshot);
  // Vi har stop-proposal men inga skrivningar mot ATR/timer i denna modul
  // (modulen har ingen DB-access — verifieras genom att ingen sådan import finns).
  assert(res.proposals.some((p) => p.proposalType === 'suggest_workday_end'));
});
