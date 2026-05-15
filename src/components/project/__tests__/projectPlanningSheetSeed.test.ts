import { describe, it, expect } from 'vitest';
import { pickBookingTime, isPhaseLocked } from '../ProjectPlanningSheet';

describe('pickBookingTime', () => {
  const booking = {
    rig_start_time: '07:30:00',
    rig_end_time: '15:00:00',
    event_start_time: null,
    event_end_time: '23:30:00',
    rigdown_start_time: '',
    rigdown_end_time: undefined,
  };

  it('använder bokningens tid när den finns och trimmar sekunder', () => {
    expect(pickBookingTime(booking, 'rig', 'start')).toBe('07:30');
    expect(pickBookingTime(booking, 'rig', 'end')).toBe('15:00');
    expect(pickBookingTime(booking, 'event', 'end')).toBe('23:30');
  });

  it('faller tillbaka till DEFAULTS när värdet saknas', () => {
    expect(pickBookingTime(booking, 'event', 'start')).toBe('17:00');
    expect(pickBookingTime(booking, 'rigDown', 'start')).toBe('08:00');
    expect(pickBookingTime(booking, 'rigDown', 'end')).toBe('16:00');
  });

  it('hanterar tomt/null booking', () => {
    expect(pickBookingTime(null, 'rig', 'start')).toBe('08:00');
    expect(pickBookingTime(undefined, 'event', 'end')).toBe('23:00');
  });

  it('hanterar timestamptz-format (YYYY-MM-DD HH:MM:SS+TZ) från bokningar', () => {
    const tsBooking = {
      rig_start_time: '2026-05-19 13:00:00+00',
      rig_end_time: '2026-05-19 15:00:00+00',
      event_start_time: '2026-05-19T17:00:00.000Z',
      event_end_time: '2026-05-19T23:00:00+02',
    };
    expect(pickBookingTime(tsBooking, 'rig', 'start')).toBe('13:00');
    expect(pickBookingTime(tsBooking, 'rig', 'end')).toBe('15:00');
    expect(pickBookingTime(tsBooking, 'event', 'start')).toBe('17:00');
    expect(pickBookingTime(tsBooking, 'event', 'end')).toBe('23:00');
  });
});

describe('isPhaseLocked', () => {
  it('läser *_time_locked från bokningen', () => {
    const b = { rig_time_locked: true, event_time_locked: false };
    expect(isPhaseLocked(b, 'rig')).toBe(true);
    expect(isPhaseLocked(b, 'event')).toBe(false);
    expect(isPhaseLocked(b, 'rigDown')).toBe(false);
    expect(isPhaseLocked(null, 'rig')).toBe(false);
  });
});
