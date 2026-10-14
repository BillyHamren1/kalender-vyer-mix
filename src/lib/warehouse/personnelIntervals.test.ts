// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { personnelIntervals, unstaffedWarehouseEvents } from './personnelIntervals';

describe('personnel interval read model', () => {
  it('clips an event starting before the displayed day without inventing its full duration', () => {
    expect(personnelIntervals('2026-10-13T22:00:00+02:00', '2026-10-14T03:00:00+02:00', '2026-10-13', '2026-10-14', '2026-10-14')).toEqual([
      { date: '2026-10-14', startTime: '00:00', endTime: '03:00', plannedDurationMinutes: 180 },
    ]);
  });
  it('splits cross-midnight work into separate dated segments', () => {
    expect(personnelIntervals('2026-10-13T22:00:00+02:00', '2026-10-14T03:00:00+02:00', '2026-10-13', '2026-10-13', '2026-10-14')).toEqual([
      { date: '2026-10-13', startTime: '22:00', endTime: '24:00', plannedDurationMinutes: 120 },
      { date: '2026-10-14', startTime: '00:00', endTime: '03:00', plannedDurationMinutes: 180 },
    ]);
  });
  it('does not add an empty segment when the interval ends at midnight', () => {
    expect(personnelIntervals('2026-10-13T22:00:00+02:00', '2026-10-14T00:00:00+02:00', '2026-10-13', '2026-10-14', '2026-10-14')).toEqual([]);
  });
  it.each([['2026-03-29', '2026-03-30', 23 * 60], ['2026-10-25', '2026-10-26', 25 * 60]])('keeps elapsed minutes on DST day %s', (day, next, minutes) => {
    expect(personnelIntervals(`${day}T00:00:00`, `${next}T00:00:00`, day, day, day)[0]).toEqual({ date: day, startTime: '00:00', endTime: '24:00', plannedDurationMinutes: minutes });
  });
  it('handles legacy SQL time fields without assuming overnight duration', () => {
    expect(personnelIntervals('08:30:00', '10:00:00', '2026-10-14', '2026-10-14', '2026-10-14')[0].plannedDurationMinutes).toBe(90);
    expect(personnelIntervals('23:00:00', '01:00:00', '2026-10-14', '2026-10-14', '2026-10-14')[0].plannedDurationMinutes).toBeNull();
    expect(personnelIntervals(null, null, '2026-10-14', '2026-10-14', '2026-10-14')[0].plannedDurationMinutes).toBeNull();
    expect(personnelIntervals('08:00', '10:00', '2026-10-13', '2026-10-14', '2026-10-14')).toEqual([]);
  });
  it('only marks the exact assigned event staffed, even for same-booking same-day jobs', () => {
    const first = { id: 'first', booking_id: 'booking', event_type: 'packing' };
    const second = { id: 'second', booking_id: 'booking', event_type: 'packing' };
    expect(unstaffedWarehouseEvents([first, second], [{ warehouse_event_id: 'first' }])).toEqual([second]);
    expect(unstaffedWarehouseEvents([first, second], [{ warehouse_event_id: null }])).toEqual([first, second]);
  });
});
