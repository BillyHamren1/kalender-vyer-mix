import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decideExistingTimeUpdate, detectPhaseSourceChange, planDateMoves, readSourceCheckpoint, resolveRowSourceChange,
} from '../../supabase/functions/_shared/calendarSourceChange';
import { pickBaseline, baselineDiffers, calendarPrevFrom } from '../../supabase/functions/_shared/calendarSourceBaseline';

// Exakt FA-2611-1-mönster (syntetiska värden, ingen kunddata):
// legacy kalenderrad 4 dec utan checkpoint, tidigare booking-tid null;
// import sparar booking 8 dec 14:00 och kraschar FÖRE första kalenderskrivning.
const B = 'FA-LEGACY-TEST';
const ctx: any = { hadSourceError: false, sourceFound: true, revisionValidated: true, leaseOwned: true,
  datesCompleteness: 'complete', datePresence: { rig: 'present', event: 'present', rigDown: 'present' } };
const NEW = { s: '2026-12-08T14:00:00+00:00', e: '2026-12-08T18:00:00+00:00' };
const preSave = { id: B, rigdaydate: '2026-12-04', eventdate: '2026-12-10', rigdowndate: '2026-12-12',
  rig_start_time_external: null, rig_end_time_external: null };
const savedSameDate = { ...preSave, rigdaydate: '2026-12-04', rig_start_time_external: '2026-12-04T14:00:00+00:00', rig_end_time_external: '2026-12-04T18:00:00+00:00' };
const savedMoved = { ...preSave, rigdaydate: '2026-12-08', rig_start_time_external: NEW.s, rig_end_time_external: NEW.e };

// Baseline fångas FÖRE booking-save (durable) och överlever kraschen.
const baseline = pickBaseline(preSave);

function decideLegacy(row: any, desired: { s: string; e: string }, prevRow: any, next: any) {
  return decideExistingTimeUpdate({
    rowLocked: row.times_locked === true,
    desiredExplicitStart: true,
    timesDiffer: row.start_time !== desired.s || row.end_time !== desired.e,
    source: resolveRowSourceChange({
      desiredExplicitStart: true, desiredStart: desired.s, desiredEnd: desired.e,
      checkpoint: readSourceCheckpoint(row), // legacy → null
      legacy: detectPhaseSourceChange(prevRow, next, 'rig'),
    }),
  });
}

describe('baseline före booking-save', () => {
  it('fångas när kalender-relevanta fält ändras, inte vid orelaterad import', () => {
    expect(baselineDiffers(preSave, savedMoved)).toBe(true);
    expect(baselineDiffers(preSave, { ...preSave, client: 'x' })).toBe(false);
  });
  it('baseline vinner över redan sparad bokningsrad', () => {
    expect(calendarPrevFrom(savedMoved, baseline).rigdaydate).toBe('2026-12-04');
    expect(calendarPrevFrom(savedMoved, null)).toBe(savedMoved);
  });
});

describe('legacy cp=null: samma datum, ny låst tid, krasch före kalenderskrivning', () => {
  const legacyRow = { id: 'cal-1', event_type: 'rig', booking_id: B, source: 'booking', source_date: '2026-12-04',
    times_locked: true, resource_id: 'team-2', start_time: '2026-12-04T08:00:00+00:00', end_time: '2026-12-04T16:00:00+00:00',
    source_start_time: null, source_end_time: null };
  const want = { s: savedSameDate.rig_start_time_external!, e: savedSameDate.rig_end_time_external! };
  it('utan baseline missar retry ändringen (dokumenterar buggen)', () => {
    expect(decideLegacy(legacyRow, want, savedSameDate, savedSameDate)).toBe('skip_locked');
  });
  it('med hållbar baseline uppdateras låst legacy-tid på retry', () => {
    expect(decideLegacy(legacyRow, want, calendarPrevFrom(savedSameDate, baseline), savedSameDate)).toBe('update');
  });
  it('replay efter lyckad retry är idempotent (baseline rensad, tid applicerad)', () => {
    const applied = { ...legacyRow, start_time: want.s, end_time: want.e, source_start_time: want.s, source_end_time: want.e };
    expect(decideLegacy(applied, want, savedSameDate, savedSameDate)).toBe('skip_same');
  });
});

describe('legacy cp=null: datumflytt 4→8, krasch före kalenderskrivning', () => {
  const legacyRow = { id: 'cal-1', event_type: 'rig', booking_id: B, source: 'booking', source_date: '2026-12-04',
    times_locked: true, resource_id: 'team-2', start_time: '2026-12-04T08:00:00+00:00', end_time: '2026-12-04T16:00:00+00:00',
    source_start_time: null, source_end_time: null };
  const localExtra = { id: 'cal-x', event_type: 'rig', booking_id: B, source: 'manual', source_date: '2026-12-05',
    times_locked: true, resource_id: 'team-3', start_time: '2026-12-05T07:00:00+00:00', end_time: '2026-12-05T15:00:00+00:00' };
  const movesFor = (prevRow: any) => {
    const sc = detectPhaseSourceChange(prevRow, savedMoved, 'rig');
    return planDateMoves({ phase: 'rig', existing: [legacyRow, localExtra] as any[], desiredDates: ['2026-12-08'],
      prevCanonicalDates: sc.dateChanged && sc.prevDate ? [sc.prevDate] : [], bookingId: B, ctx });
  };
  it('utan baseline: ingen flytt (gammal rad kvar + ny rad = buggen)', () => {
    expect(movesFor(savedMoved)).toEqual([]);
  });
  it('med baseline: samma rad flyttas 4→8, team och lås bevaras, ingen ny rad', () => {
    const mv = movesFor(calendarPrevFrom(savedMoved, baseline));
    expect(mv).toHaveLength(1);
    expect(mv[0].event.id).toBe('cal-1');
    expect(mv[0].event.resource_id).toBe('team-2');
    expect(mv[0].event.times_locked).toBe(true);
    expect([mv[0].fromDate, mv[0].toDate]).toEqual(['2026-12-04', '2026-12-08']);
  });
  it('lokal extra dag rörs aldrig', () => {
    expect(movesFor(calendarPrevFrom(savedMoved, baseline)).some((m) => m.event.id === 'cal-x')).toBe(false);
  });
  it('flyttad låst rad får ny källtid (explicit) på måldatumet', () => {
    const moved = { ...legacyRow, source_date: '2026-12-08', start_time: NEW.s, end_time: NEW.e, source_start_time: NEW.s, source_end_time: NEW.e };
    expect(decideLegacy(moved, NEW, savedMoved, savedMoved)).toBe('skip_same');
  });
});

describe('checkpoint skrivs bara när önskad tid faktiskt applicerats', () => {
  const imp = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
  it('KEEP-TIME (skip_local_unchanged_source/skip_locked) skriver ingen checkpoint', () => {
    expect(imp).toMatch(/const cpWrite = checkpointsAvailable\s*&& \(explicitTimeChanged \|\| timeDecision === 'skip_same'\)/);
  });
  it('move skriver checkpoint endast med explicit önskad tid', () => {
    expect(imp).toMatch(/if \(checkpointsAvailable && want\?\.isExplicitStart\) \{\s*movePayload\.source_start_time = want\.start_time;/);
  });
});

describe('import-wiring för hållbar baseline', () => {
  const imp = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
  it('baseline fångas före booking-update och fail-closed hoppar över sparningen', () => {
    const cap = imp.indexOf('captureCalendarBaseline(supabase');
    const upd = imp.indexOf("assertLeaseOwned('booking_update')");
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(upd);
    expect(imp).toMatch(/calendar_baseline_capture_failed[\s\S]{0,80}results\.failed\+\+;\s*continue;/);
  });
  it('kalendern använder baseline som föregående källa och rensar först efter applicerad reconcile', () => {
    expect(imp).toMatch(/reconcileCalendarEvents\(\s*supabase, bookingData, organizationId, results, calendarPrev, calendarSyncCtx,/);
    expect(imp).toMatch(/res\.ok && res\.applied !== false && calendarBaselineUsed[\s\S]{0,60}clearCalendarBaseline/);
  });
  it('gate/needs_planning-skip räknas inte som applicerad (baseline behålls)', () => {
    expect(imp).toMatch(/0 calendar mutations`\);\s*return \{ ok: true, applied: false \};/);
    expect(imp).toMatch(/linked project is needs_planning`\);\s*return \{ ok: true, applied: false \};/);
  });
});
