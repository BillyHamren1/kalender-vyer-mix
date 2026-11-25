import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decideExistingTimeUpdate, detectPhaseSourceChange, planDateMoves, readSourceCheckpoint,
  resolveRowSourceChange, checkpointNeedsWrite, checkpointedAbandonedDates,
} from '../../supabase/functions/_shared/calendarSourceChange';

const B = 'FA-TEST-1';
const ctx: any = { hadSourceError: false, sourceFound: true, revisionValidated: true, leaseOwned: true,
  datesCompleteness: 'complete', datePresence: { rig: 'present', event: 'present', rigDown: 'present' } };
const S1 = { s: '2026-12-08T08:00:00+00:00', e: '2026-12-08T16:00:00+00:00' };
const S2 = { s: '2026-12-08T14:00:00+00:00', e: '2026-12-08T18:00:00+00:00' };
const L = { s: '2026-12-08T10:00:00+00:00', e: '2026-12-08T17:00:00+00:00' };
const savedBooking = { rigdaydate: '2026-12-08', rig_start_time_external: S2.s, rig_end_time_external: S2.e };

function decide(existing: any, desired: { s: string; e: string }) {
  return decideExistingTimeUpdate({
    rowLocked: existing.times_locked === true,
    desiredExplicitStart: true,
    timesDiffer: existing.start_time !== desired.s || existing.end_time !== desired.e,
    source: resolveRowSourceChange({
      desiredExplicitStart: true, desiredStart: desired.s, desiredEnd: desired.e,
      checkpoint: readSourceCheckpoint(existing),
      // retry: booking row already saved → legacy diff sees no change
      legacy: detectPhaseSourceChange(savedBooking, savedBooking, 'rig'),
    }),
  });
}

describe('retry after booking saved but calendar failed', () => {
  it('legacy comparison alone would miss the change (documents the bug)', () => {
    expect(detectPhaseSourceChange(savedBooking, savedBooking, 'rig').timeChanged).toBe(false);
  });
  it('locked row with old checkpoint is updated on retry', () => {
    const row = { id: 'e1', times_locked: true, start_time: S1.s, end_time: S1.e, source_start_time: S1.s, source_end_time: S1.e };
    expect(decide(row, S2)).toBe('update');
  });
  it('unlocked row with old checkpoint is updated on retry', () => {
    const row = { id: 'e1', times_locked: false, start_time: S1.s, end_time: S1.e, source_start_time: S1.s, source_end_time: S1.e };
    expect(decide(row, S2)).toBe('update');
  });
  it('after a successful retry the checkpoint matches → idempotent replay', () => {
    const row = { id: 'e1', times_locked: true, start_time: S2.s, end_time: S2.e, source_start_time: S2.s, source_end_time: S2.e };
    expect(decide(row, S2)).toBe('skip_same');
    expect(checkpointNeedsWrite(true, S2.s, S2.e, readSourceCheckpoint(row))).toBe(false);
  });
  it('timestamp formats compare by instant, not string', () => {
    const row = { start_time: S2.s, end_time: S2.e, source_start_time: '2026-12-08 14:00:00+00', source_end_time: '2026-12-08T18:00:00Z' };
    expect(checkpointNeedsWrite(true, S2.s, S2.e, readSourceCheckpoint(row))).toBe(false);
  });
});

describe('local time edit after a fully applied import', () => {
  it('locked local edit survives unrelated re-import', () => {
    const row = { times_locked: true, start_time: L.s, end_time: L.e, source_start_time: S2.s, source_end_time: S2.e };
    expect(decide(row, S2)).toBe('skip_locked');
  });
  it('unlocked local edit survives unrelated re-import', () => {
    const row = { times_locked: false, start_time: L.s, end_time: L.e, source_start_time: S2.s, source_end_time: S2.e };
    expect(decide(row, S2)).toBe('skip_local_unchanged_source');
  });
  it('a newer Sales time still wins over the local edit', () => {
    const row = { times_locked: true, start_time: L.s, end_time: L.e, source_start_time: S1.s, source_end_time: S1.e };
    expect(decide(row, S2)).toBe('update');
  });
  it('default (non-explicit) source never counts as change and writes no checkpoint', () => {
    expect(resolveRowSourceChange({ desiredExplicitStart: false, desiredStart: S2.s, desiredEnd: S2.e,
      checkpoint: { startMs: 1, endMs: 2 }, legacy: { known: false, timeChanged: false } }).timeChanged).toBe(false);
    expect(checkpointNeedsWrite(false, S2.s, S2.e, null)).toBe(false);
  });
  it('legacy row without checkpoint gets it backfilled when already equal', () => {
    expect(checkpointNeedsWrite(true, S2.s, S2.e, readSourceCheckpoint({ start_time: S2.s }))).toBe(true);
  });
});

describe('date move retry uses row checkpoint', () => {
  const oldRow = { id: 'r1', event_type: 'rig', booking_id: B, source_date: '2026-12-04', start_time: '2026-12-04T08:00:00+00:00',
    end_time: '2026-12-04T16:00:00+00:00', resource_id: 'team-3', times_locked: true, source_start_time: '2026-12-04T08:00:00+00:00' };
  it('abandoned checkpointed date is found though booking row already shows new date', () => {
    expect(detectPhaseSourceChange(savedBooking, savedBooking, 'rig').dateChanged).toBe(false);
    expect(checkpointedAbandonedDates([oldRow], 'rig', ['2026-12-08'], B)).toEqual(['2026-12-04']);
  });
  it('moves the same row (id, team, lock) – no duplicate', () => {
    const moves = planDateMoves({ phase: 'rig', existing: [oldRow] as any, desiredDates: ['2026-12-08'],
      prevCanonicalDates: checkpointedAbandonedDates([oldRow], 'rig', ['2026-12-08'], B), bookingId: B, ctx });
    expect(moves).toHaveLength(1);
    expect(moves[0].event.id).toBe('r1');
    expect((moves[0].event as any).resource_id).toBe('team-3');
    expect(moves[0].toDate).toBe('2026-12-08');
  });
  it('locally added extra day (no checkpoint) is never a move source', () => {
    const extra = { ...oldRow, id: 'x', source_date: '2026-12-05', source_start_time: null };
    expect(checkpointedAbandonedDates([extra], 'rig', ['2026-12-08'], B)).toEqual([]);
  });
  it('other booking rows are ignored (tenant/booking scope)', () => {
    expect(checkpointedAbandonedDates([{ ...oldRow, booking_id: 'OTHER' }], 'rig', ['2026-12-08'], B)).toEqual([]);
  });
  it('fail-closed context moves nothing', () => {
    expect(planDateMoves({ phase: 'rig', existing: [oldRow] as any, desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'],
      bookingId: B, ctx: { ...ctx, revisionValidated: false } })).toEqual([]);
  });
});

describe('import wiring', () => {
  const imp = readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
  it('reads checkpoint columns with 42703 fallback', () => {
    expect(imp).toMatch(/source_start_time, source_end_time`\)/);
    expect(imp).toMatch(/code === '42703'/);
  });
  it('writes checkpoint on insert, explicit update and move', () => {
    expect(imp).toMatch(/source_start_time: desired\.start_time, source_end_time: desired\.end_time/);
    expect(imp).toMatch(/updatePayload\.source_start_time = desired\.start_time/);
    expect(imp).toMatch(/movePayload\.source_start_time = want\.start_time/);
  });
  it('failed move blocks insert on target date (no old+new row)', () => {
    expect(imp).toMatch(/blockedInsertKeys\.add\(/);
    expect(imp).toMatch(/else if \(blockedInsertKeys\.has\(key\)\)/);
  });
  it('partial outcome releases revision so the same revision is retried', () => {
    expect(imp).toMatch(/Importen blev inte fullt applicerad[\s\S]{0,200}releaseCanonicalRevision/);
  });
});
