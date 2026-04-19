/**
 * Contract tests locking the location-timer role classification.
 *
 * These rules MUST hold for the workday engine to behave consistently
 * across the global banner, the time-report page, and location detail:
 *
 *   • A timer with locationId and no presenceOnly flag is PRESENCE.
 *   • A timer with locationId and presenceOnly=false is REPORTABLE.
 *   • Project and booking timers are ALWAYS reportable; the
 *     presenceOnly flag does not apply to them.
 *   • buildStopTarget always sets createsTimeReport correctly for
 *     location targets and never invents a booking_id from a synthetic
 *     `location-…` / `project-…` key.
 */
import { describe, it, expect } from 'vitest';
import { getTimerRole, buildStopTarget } from '@/lib/timerRole';
import type { ActiveTimer } from '@/hooks/useGeofencing';

const t = (over: Partial<ActiveTimer>): ActiveTimer => ({
  bookingId: 'b1',
  client: 'Acme',
  startTime: '2026-04-19T08:00:00.000Z',
  isAutoStarted: false,
  ...over,
});

describe('getTimerRole', () => {
  it('classifies a fixed-location timer as presence by default', () => {
    const role = getTimerRole(
      t({ bookingId: 'location-l1', locationId: 'l1', locationName: 'Lager' }),
    );
    expect(role).toEqual({ kind: 'location', presenceOnly: true });
  });

  it('respects an explicit presenceOnly=false promotion', () => {
    const role = getTimerRole(
      t({
        bookingId: 'location-l1',
        locationId: 'l1',
        locationName: 'Lager',
        presenceOnly: false,
      }),
    );
    expect(role).toEqual({ kind: 'location', presenceOnly: false });
  });

  it('treats a project timer as reportable regardless of presenceOnly flag', () => {
    const role = getTimerRole(
      t({
        bookingId: 'project-p1',
        largeProjectId: 'p1',
        // Even if presenceOnly leaked in (it shouldn't), projects stay reportable.
        presenceOnly: true,
      }),
    );
    expect(role).toEqual({ kind: 'project', presenceOnly: false });
  });

  it('treats a plain booking timer as reportable', () => {
    const role = getTimerRole(t({ bookingId: 'b1', client: 'Acme' }));
    expect(role).toEqual({ kind: 'booking', presenceOnly: false });
  });
});

describe('buildStopTarget', () => {
  it('builds a presence location target with createsTimeReport=false', () => {
    const target = buildStopTarget(
      'location-l1',
      t({ bookingId: 'location-l1', locationId: 'l1', locationName: 'Lager' }),
    );
    expect(target).toEqual({
      kind: 'location',
      locationId: 'l1',
      name: 'Lager',
      createsTimeReport: false,
    });
  });

  it('builds a reportable location target when promoted', () => {
    const target = buildStopTarget(
      'location-l1',
      t({
        bookingId: 'location-l1',
        locationId: 'l1',
        locationName: 'Lager',
        presenceOnly: false,
      }),
    );
    expect(target).toEqual({
      kind: 'location',
      locationId: 'l1',
      name: 'Lager',
      createsTimeReport: true,
    });
  });

  it('builds a project target', () => {
    const target = buildStopTarget(
      'project-p1',
      t({ bookingId: 'project-p1', largeProjectId: 'p1', client: 'Stora projektet' }),
    );
    expect(target).toEqual({
      kind: 'project',
      largeProjectId: 'p1',
      name: 'Stora projektet',
    });
  });

  it('builds a booking target using the map key, not the synthetic bookingId', () => {
    const target = buildStopTarget('actual-booking-id', t({ bookingId: 'actual-booking-id' }));
    expect(target).toEqual({
      kind: 'booking',
      bookingId: 'actual-booking-id',
      client: 'Acme',
    });
  });
});
