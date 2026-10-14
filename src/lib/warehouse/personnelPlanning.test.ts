import { describe, it, expect } from 'vitest';
import { clockMinutes, durationMinutes, planningSummary, conflictingJobs, timelineLanes } from './personnelPlanning';
const job = (startTime: string | null, endTime: string | null, date = '2026-10-14') => ({ date, startTime, endTime });
describe('personnel planning', () => {
  it('never treats invalid or incomplete times as a known workload', () => {
    expect(clockMinutes('2026-')).toBeNull();
    expect(clockMinutes('24:30')).toBeNull();
    expect(durationMinutes(job('23:00', '01:00'))).toBeNull();
    expect(planningSummary([job('08:00', '10:30'), job('11:00', null)])).toBe('2 h 30 min planerat · 1 utan fullständig tid');
  });
  it('detects real overlaps, not adjacent jobs or different days', () => {
    const a = job('08:00', '10:00'), b = job('09:00', '11:00'), c = job('11:00', '12:00');
    expect([...conflictingJobs([a, b, c, job('08:00', '10:00', '2026-10-15')])]).toEqual([a, b]);
    expect(conflictingJobs([a, {...b, status: 'completed'}]).size).toBe(0);
  });
  it('keeps short cards and simultaneous jobs in separate lanes and reuses freed lanes', () => {
    const result = timelineLanes([{job: 'a', top: 0, height: 108}, {job: 'b', top: 30, height: 108}, {job: 'c', top: 108, height: 108}]);
    expect(result.laneCount).toBe(2);
    expect(result.items.map(item => item.lane)).toEqual([0, 1, 0]);
  });
});
