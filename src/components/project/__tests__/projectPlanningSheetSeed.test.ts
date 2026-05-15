import { describe, it, expect } from 'vitest';
import { pickBookingTime } from '../ProjectPlanningSheet';

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
});
