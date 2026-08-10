import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildDatePresence,
  canDeleteCanonicalDateEvent,
  canMutateCalendar,
  dedupeDesiredEvents,
  eventCanonicalDate,
  fallbackCalendarContext,
  isBookingGeneratedEvent,
  readDateFieldPresence,
  readDateSourceCompleteness,
  type CalendarSyncContext,
} from '../../supabase/functions/_shared/calendarSourceAuthority';

const ctx = (over: Partial<CalendarSyncContext> = {}): CalendarSyncContext => ({
  sourceFound: true,
  revisionValidated: true,
  leaseOwned: true,
  datesCompleteness: 'complete',
  datePresence: { rig: 'present', event: 'present', rigDown: 'present' },
  ...over,
});

const canonical = (over: Partial<Record<'rig' | 'event' | 'rigDown', string[]>> = {}) => ({
  rig: [], event: [], rigDown: [], ...over,
});

describe('STEG 3E – field ownership & presence', () => {
  it('absent field ≠ empty list', () => {
    expect(readDateFieldPresence({}, 'rig')).toBe('absent');
    expect(readDateFieldPresence({ rig_up_dates: [] }, 'rig')).toBe('empty');
    expect(readDateFieldPresence({ rig_up_dates: ['2026-08-10'] }, 'rig')).toBe('present');
    expect(readDateFieldPresence({ rigdaydate: '2026-08-10' }, 'rig')).toBe('present');
  });

  it('completeness is fail-closed', () => {
    expect(readDateSourceCompleteness({})).toBe('unknown');
    expect(readDateSourceCompleteness({ dates_complete: 'true' })).toBe('unknown');
    expect(readDateSourceCompleteness({ dates_complete: false })).toBe('incomplete');
    expect(readDateSourceCompleteness({ meta: { dates_complete: true } })).toBe('complete');
  });

  it('builds presence map for all three phases', () => {
    expect(buildDatePresence({ rig_up_dates: ['2026-01-01'], event_dates: [] })).toEqual({
      rig: 'present', event: 'empty', rigDown: 'absent',
    });
  });
});

describe('STEG 3E – event ownership', () => {
  it('booking-generated phases are owned', () => {
    expect(isBookingGeneratedEvent({ event_type: 'rig', booking_id: 'b1' }, 'b1')).toBe(true);
    expect(isBookingGeneratedEvent({ event_type: 'rigDown', booking_id: 'b1' }, 'b1')).toBe(true);
  });
  it('manual activities and planning-only rows are never owned', () => {
    expect(isBookingGeneratedEvent({ event_type: 'activity', booking_id: 'b1' }, 'b1')).toBe(false);
    expect(isBookingGeneratedEvent({ event_type: 'task', booking_id: 'b1' }, 'b1')).toBe(false);
    expect(isBookingGeneratedEvent({ event_type: 'custom' }, 'b1')).toBe(false);
    expect(isBookingGeneratedEvent({ event_type: 'rig', booking_id: 'other' }, 'b1')).toBe(false);
    expect(isBookingGeneratedEvent({ event_type: 'rig', booking_id: 'b1', source: 'planner' }, 'b1')).toBe(false);
  });
  it('canonical date prefers source_date', () => {
    expect(eventCanonicalDate({ source_date: '2026-08-10', start_time: '2026-08-11T08:00:00Z' })).toBe('2026-08-10');
    expect(eventCanonicalDate({ start_time: '2026-08-11T08:00:00Z' })).toBe('2026-08-11');
  });
});

describe('STEG 3E – mutation gate', () => {
  it('allows only validated source + revision + lease', () => {
    expect(canMutateCalendar(ctx()).allowed).toBe(true);
    expect(canMutateCalendar(ctx({ revisionValidated: false })).allowed).toBe(false);
    expect(canMutateCalendar(ctx({ leaseOwned: false })).allowed).toBe(false);
    expect(canMutateCalendar(ctx({ hadSourceError: true })).allowed).toBe(false);
    expect(canMutateCalendar(ctx({ sourceFound: false })).allowed).toBe(false);
  });
  it('local fallback allows non-destructive recovery only', () => {
    const fb = fallbackCalendarContext();
    expect(canMutateCalendar(fb).allowed).toBe(true);
    expect(canDeleteCanonicalDateEvent(
      { event_type: 'rig', source_date: '2026-08-10', booking_id: 'b1' },
      fb, { bookingId: 'b1', canonicalDates: canonical() },
    ).allowed).toBe(false);
  });
});

describe('STEG 3E – canonical date removal', () => {
  const ev = { event_type: 'rig', source_date: '2026-08-10', booking_id: 'b1', id: 'e1' };

  it('deletes a booking-generated event when the canonical date is gone', () => {
    const r = canDeleteCanonicalDateEvent(ev, ctx({ datePresence: { rig: 'empty', event: 'absent', rigDown: 'absent' } }), {
      bookingId: 'b1', canonicalDates: canonical(),
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('canonical_date_removed');
  });

  it('never deletes when the date field is absent', () => {
    const r = canDeleteCanonicalDateEvent(ev, ctx({ datePresence: { rig: 'absent', event: 'absent', rigDown: 'absent' } }), {
      bookingId: 'b1', canonicalDates: canonical(),
    });
    expect(r).toEqual({ allowed: false, reason: 'date_field_absent' });
  });

  it('never deletes on partial/unknown completeness', () => {
    for (const c of ['unknown', 'incomplete'] as const) {
      expect(canDeleteCanonicalDateEvent(ev, ctx({ datesCompleteness: c }), {
        bookingId: 'b1', canonicalDates: canonical(),
      })).toEqual({ allowed: false, reason: 'dates_not_verified_complete' });
    }
  });

  it('never deletes on not_found / stale revision / lost lease / source error', () => {
    const cases: Array<[Partial<CalendarSyncContext>, string]> = [
      [{ sourceFound: false }, 'source_not_found_or_fallback'],
      [{ revisionValidated: false }, 'invalid_or_stale_source_revision'],
      [{ leaseOwned: false }, 'lease_not_owned'],
      [{ hadSourceError: true }, 'source_error'],
    ];
    for (const [over, reason] of cases) {
      expect(canDeleteCanonicalDateEvent(ev, ctx(over), { bookingId: 'b1', canonicalDates: canonical() }))
        .toEqual({ allowed: false, reason });
    }
  });

  it('keeps the event when the date is still canonical', () => {
    expect(canDeleteCanonicalDateEvent(ev, ctx(), {
      bookingId: 'b1', canonicalDates: canonical({ rig: ['2026-08-10'] }),
    })).toEqual({ allowed: false, reason: 'date_still_canonical' });
  });

  it('keeps manual activities and locked rows on the same date', () => {
    expect(canDeleteCanonicalDateEvent({ ...ev, event_type: 'activity' }, ctx(), {
      bookingId: 'b1', canonicalDates: canonical(),
    })).toEqual({ allowed: false, reason: 'not_booking_generated' });
    expect(canDeleteCanonicalDateEvent({ ...ev, times_locked: true }, ctx(), {
      bookingId: 'b1', canonicalDates: canonical(),
    })).toEqual({ allowed: false, reason: 'times_locked' });
  });

  it('keeps events belonging to another organization/booking', () => {
    expect(canDeleteCanonicalDateEvent({ ...ev, booking_id: 'b2' }, ctx(), {
      bookingId: 'b1', canonicalDates: canonical(),
    }).allowed).toBe(false);
  });
});

describe('STEG 3E – idempotens', () => {
  it('dedupes booking + event_type + date', () => {
    const out = dedupeDesiredEvents([
      { event_type: 'rig', date: '2026-08-10' },
      { event_type: 'rig', date: '2026-08-10' },
      { event_type: 'rigDown', date: '2026-08-12' },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('STEG 3E – statisk verifiering av import-bookings', () => {
  const src = readFileSync(join(process.cwd(), 'supabase/functions/import-bookings/index.ts'), 'utf-8');

  it('reconcile is gated by canMutateCalendar', () => {
    expect(src).toContain('const mutationGate = canMutateCalendar(calendarCtx)');
  });

  it('stale deletes go through canDeleteCanonicalDateEvent', () => {
    expect(src).toContain('canDeleteCanonicalDateEvent(e, calendarCtx');
  });

  it('all calendar_events mutations inside reconcile are organization-filtered', () => {
    const start = src.indexOf('async function reconcileCalendarEvents');
    const end = src.indexOf('async function reconcileCalendarEvents') + src.slice(start).indexOf('\n}\n');
    const body = src.slice(start, end);
    const mutations = [...body.matchAll(/\.from\('calendar_events'\)\s*\n\s*\.(update|delete)\(/g)];
    expect(mutations.length).toBeGreaterThan(0);
    for (const m of mutations) {
      const window = body.slice(m.index ?? 0, (m.index ?? 0) + 500);
      expect(window).toContain("eq('organization_id'");
      expect(window).toContain("eq('booking_id'");
    }
  });

  it('calendar failures are surfaced as errors (no completed/cursor)', () => {
    expect(src).toContain('calendar_reconcile_failed');
    expect(src).toContain('results.errors.push({ booking_id: bookingData.id, error: res.error');
  });

  it('cancellation safety remains untouched', () => {
    expect(src).toContain('isAutomaticDestructiveSyncEnabled');
  });
});
