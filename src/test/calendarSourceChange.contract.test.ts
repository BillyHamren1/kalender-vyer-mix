import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decideExistingTimeUpdate, detectPhaseSourceChange, planDateMoves, shiftIsoByDays,
} from '../../supabase/functions/_shared/calendarSourceChange';
import type { CalendarSyncContext } from '../../supabase/functions/_shared/calendarSourceAuthority';

const B = 'booking-1';
const ctx = (o: Partial<CalendarSyncContext> = {}): CalendarSyncContext => ({
  sourceFound: true, revisionValidated: true, leaseOwned: true, datesCompleteness: 'complete',
  datePresence: { rig: 'present', event: 'present', rigDown: 'present' }, ...o,
});
const ev = (id: string, date: string, o: any = {}) => ({
  id, booking_id: B, event_type: 'rig', source_date: date, start_time: `${date}T08:00:00+00:00`,
  end_time: `${date}T16:00:00+00:00`, resource_id: 'team-3', times_locked: false, ...o,
});
// FA-2611-1-shaped fixture (synthetic): rig 4 dec → Sales 8 dec 14:00.
const prev = { rigdaydate: '2026-12-04', rig_start_time_external: null, rig_end_time_external: null };
const next = { rigdaydate: '2026-12-08', rig_start_time_external: '2026-12-08T14:00:00', rig_end_time_external: null };

describe('source change detection', () => {
  it('date move + explicit new time is detected', () => {
    const c = detectPhaseSourceChange(prev, next, 'rig');
    expect(c).toMatchObject({ known: true, dateChanged: true, prevDate: '2026-12-04', nextDate: '2026-12-08', timeChanged: true });
  });
  it('replay of same source is no change (idempotent)', () => {
    expect(detectPhaseSourceChange(next, next, 'rig')).toMatchObject({ dateChanged: false, timeChanged: false });
  });
  it('empty/missing incoming time never counts as change', () => {
    const p = { rigdaydate: '2026-12-08', rig_start_time_external: '2026-12-08T14:00:00' };
    expect(detectPhaseSourceChange(p, { rigdaydate: '2026-12-08', rig_start_time_external: null }, 'rig').timeChanged).toBe(false);
  });
  it('no previous row → unknown (legacy path)', () => {
    expect(detectPhaseSourceChange(undefined, next, 'rig').known).toBe(false);
  });
});

describe('time update decision', () => {
  const changed = { known: true, timeChanged: true };
  const same = { known: true, timeChanged: false };
  it('locked row + newer explicit source time → update', () => {
    expect(decideExistingTimeUpdate({ rowLocked: true, desiredExplicitStart: true, timesDiffer: true, source: changed })).toBe('update');
  });
  it('unlocked row + newer explicit source time → update', () => {
    expect(decideExistingTimeUpdate({ rowLocked: false, desiredExplicitStart: true, timesDiffer: true, source: changed })).toBe('update');
  });
  it('locked row + unrelated import → keep', () => {
    expect(decideExistingTimeUpdate({ rowLocked: true, desiredExplicitStart: true, timesDiffer: true, source: same })).toBe('skip_locked');
  });
  it('unlocked local adjustment + unrelated import → keep', () => {
    expect(decideExistingTimeUpdate({ rowLocked: false, desiredExplicitStart: true, timesDiffer: true, source: same })).toBe('skip_local_unchanged_source');
  });
  it('default (non-explicit) source time never overwrites', () => {
    expect(decideExistingTimeUpdate({ rowLocked: false, desiredExplicitStart: false, timesDiffer: true, source: changed })).toBe('skip_default');
  });
});

describe('date moves', () => {
  it('locked row moves to new date, same id/team, no duplicate', () => {
    const locked = ev('e1', '2026-12-04', { times_locked: true });
    const m = planDateMoves({ phase: 'rig', existing: [locked], desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'], bookingId: B, ctx: ctx() });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ fromDate: '2026-12-04', toDate: '2026-12-08' });
    expect(m[0].event.id).toBe('e1');
    expect(m[0].event.resource_id).toBe('team-3');
  });
  it('no move when target date already has a row (no duplicate)', () => {
    const m = planDateMoves({ phase: 'rig', existing: [ev('a', '2026-12-04'), ev('b', '2026-12-08')], desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'], bookingId: B, ctx: ctx() });
    expect(m).toHaveLength(0);
  });
  it('multi-date: deterministic sorted pairing, extras untouched', () => {
    const rows = [ev('x2', '2026-12-05'), ev('x1', '2026-12-04'), ev('keep', '2026-12-06')];
    const m = planDateMoves({ phase: 'rig', existing: rows, desiredDates: ['2026-12-06', '2026-12-09', '2026-12-08'], prevCanonicalDates: ['2026-12-04', '2026-12-05'], bookingId: B, ctx: ctx() });
    expect(m.map((x) => [x.event.id, x.toDate])).toEqual([['x1', '2026-12-08'], ['x2', '2026-12-09']]);
  });
  it('manual-only rows and other bookings are never moved', () => {
    expect(planDateMoves({ phase: 'rig', existing: [ev('o', '2026-12-04', { booking_id: 'other' })], desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'], bookingId: B, ctx: ctx() })).toHaveLength(0);
    const manual = ev('m', '2026-12-04', { source: 'manual' });
    expect(planDateMoves({ phase: 'rig', existing: [manual], desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'], bookingId: B, ctx: ctx() })).toHaveLength(0);
  });
  it.each([
    ['stale revision', { revisionValidated: false }],
    ['lease lost', { leaseOwned: false }],
    ['source missing', { sourceFound: false }],
    ['source error', { hadSourceError: true }],
    ['explicitly incomplete dates', { datesCompleteness: 'incomplete' as const }],
    ['phase absent', { datePresence: { rig: 'absent', event: 'present', rigDown: 'present' } as any }],
  ])('fail-closed: %s → no move', (_l, o) => {
    expect(planDateMoves({ phase: 'rig', existing: [ev('e', '2026-12-04')], desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'], bookingId: B, ctx: ctx(o as any) })).toHaveLength(0);
  });
  it('FA-2611-1: Sales utan dates_complete (unknown) flyttar samma rad i stället för ny rad', () => {
    const m = planDateMoves({ phase: 'rig', existing: [ev('e', '2026-12-04')], desiredDates: ['2026-12-08'], prevCanonicalDates: ['2026-12-04'], bookingId: B, ctx: ctx({ datesCompleteness: 'unknown' } as any) });
    expect(m.map((x) => [x.event.id, x.fromDate, x.toDate])).toEqual([['e', '2026-12-04', '2026-12-08']]);
  });
  it('shift keeps local time of day', () => {
    expect(shiftIsoByDays('2026-12-04T09:30:00+00:00', '2026-12-04', '2026-12-08')).toBe('2026-12-08T09:30:00+00:00');
  });
});

describe('import-bookings wiring', () => {
  const src = readFileSync(join(__dirname, '../../supabase/functions/import-bookings/index.ts'), 'utf8');
  it('lock no longer blanket-blocks newer canonical time', () => {
    expect(src).not.toMatch(/explicitTimeChanged = !rowLocked/);
    expect(src).toMatch(/decideExistingTimeUpdate\(/);
  });
  it('move is tenant + booking scoped and keeps resource_id/lock (not in payload)', () => {
    const block = src.slice(src.indexOf('CANONICAL DATE MOVE'), src.indexOf('const existingByKey'));
    expect(block).toMatch(/\.eq\('organization_id', calendarOrgId\)/);
    expect(block).toMatch(/\.eq\('booking_id', bookingData\.id\)/);
    expect(block).not.toMatch(/resource_id:/);
    expect(block).not.toMatch(/times_locked:/);
  });
  it('old canonical date is not re-expanded as an extra day', () => {
    expect(src).toMatch(/movedAway\.has\(/);
  });
});
