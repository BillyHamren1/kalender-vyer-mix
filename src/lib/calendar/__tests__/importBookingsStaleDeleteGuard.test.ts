/**
 * Regression test for the booking-2604-8 incident (2026-05-27).
 *
 * Locks the contract: when reconciling calendar_events against external desired
 * events, a stale row is NOT deleted if its (event_type, source_date) matches
 * the booking's local authoritative date column (rigdaydate/rigdowndate).
 *
 * This protects locally-saved phase-day changes from being wiped by an
 * external import that has not yet reflected the change.
 *
 * NOTE: We don't import the full edge function (it depends on Deno runtime).
 * This test exercises the pure stale-detection logic directly.
 */
import { describe, expect, it } from 'vitest';

interface ExistingEvent {
  id: string;
  event_type: string;
  source_date: string;
  start_time?: string;
}

interface BookingDates {
  rigdaydate: string | null;
  rigdowndate: string | null;
  eventdate?: string | null;
}

/**
 * Mirror of the stale-detection logic in
 * supabase/functions/import-bookings/index.ts (around the calendar reconciler).
 * Kept as a pure function so it's trivially testable.
 */
export function detectStaleEvents(
  existingEvents: ExistingEvent[],
  matchedExistingIds: Set<string>,
  bookingData: BookingDates,
): ExistingEvent[] {
  const localAuthoritativeKeys = new Set<string>();
  if (bookingData.rigdaydate) localAuthoritativeKeys.add(`rig|${bookingData.rigdaydate}`);
  if (bookingData.rigdowndate) localAuthoritativeKeys.add(`rigDown|${bookingData.rigdowndate}`);

  return existingEvents.filter((e) => {
    if (matchedExistingIds.has(e.id)) return false;
    const evtDate = e.source_date || e.start_time?.split('T')[0] || '';
    const key = `${e.event_type}|${evtDate}`;
    if (localAuthoritativeKeys.has(key)) return false;
    return true;
  });
}

describe('import-bookings stale-delete guard', () => {
  it('KEEPS a rig row when external desired lags behind local rigdaydate', () => {
    // Scenario: user changed rigdaydate to 2026-06-03 locally via UI;
    // savePhaseDays created a row at 06-03. External import still has rig
    // at 06-04 in its API response → desired wouldn't include 06-03 →
    // BEFORE FIX: row at 06-03 would be deleted as stale.
    const existing: ExistingEvent[] = [
      { id: 'rig-new', event_type: 'rig', source_date: '2026-06-03' },
      { id: 'rigdown', event_type: 'rigDown', source_date: '2026-06-08' },
    ];
    const matched = new Set<string>(['rigdown']); // only rigdown matched desired
    const stale = detectStaleEvents(existing, matched, {
      rigdaydate: '2026-06-03',
      rigdowndate: '2026-06-08',
    });

    expect(stale.map((e) => e.id)).toEqual([]); // NOTHING deleted
  });

  it('deletes a truly orphan row (no matching local date)', () => {
    const existing: ExistingEvent[] = [
      { id: 'rig-old', event_type: 'rig', source_date: '2026-06-04' }, // orphan
      { id: 'rig-new', event_type: 'rig', source_date: '2026-06-03' },
    ];
    const matched = new Set<string>(['rig-new']);
    const stale = detectStaleEvents(existing, matched, {
      rigdaydate: '2026-06-03',
      rigdowndate: null,
    });

    expect(stale.map((e) => e.id)).toEqual(['rig-old']);
  });

  it('protects rigDown the same way', () => {
    const existing: ExistingEvent[] = [
      { id: 'rd', event_type: 'rigDown', source_date: '2026-06-08' },
    ];
    const matched = new Set<string>();
    const stale = detectStaleEvents(existing, matched, {
      rigdaydate: null,
      rigdowndate: '2026-06-08',
    });

    expect(stale).toEqual([]);
  });

  it('does NOT protect event-day rows (intentionally not persisted)', () => {
    const existing: ExistingEvent[] = [
      { id: 'evt', event_type: 'event', source_date: '2026-06-05' },
    ];
    const matched = new Set<string>();
    const stale = detectStaleEvents(existing, matched, {
      rigdaydate: null,
      rigdowndate: null,
      eventdate: '2026-06-05',
    });

    // event-days are intentionally NOT persisted to calendar_events
    // (see import-bookings/index.ts line 1101-1104). The guard does not
    // protect them — they will be cleaned up as stale.
    expect(stale.map((e) => e.id)).toEqual(['evt']);
  });

  it('falls back to start_time date when source_date is missing', () => {
    const existing: ExistingEvent[] = [
      { id: 'rig', event_type: 'rig', source_date: '', start_time: '2026-06-03T08:00:00Z' },
    ];
    const matched = new Set<string>();
    const stale = detectStaleEvents(existing, matched, {
      rigdaydate: '2026-06-03',
      rigdowndate: null,
    });

    expect(stale).toEqual([]);
  });
});
