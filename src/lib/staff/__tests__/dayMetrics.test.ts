import { describe, it, expect } from 'vitest';
import { calculateDayMetrics } from '../dayMetrics';

const ISO = (h: number, m = 0) => `2026-05-03T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

describe('calculateDayMetrics', () => {
  it('payable = workday, never workday + activity', () => {
    const m = calculateDayMetrics({
      workday: { started_at: ISO(8), ended_at: ISO(16) }, // 8h
      activitySegments: [
        { start: ISO(8), end: ISO(12), hours: 4 },
        { start: ISO(13), end: ISO(15), hours: 2 },
      ],
      travelSegments: [{ start: ISO(15), end: ISO(16), hours: 1 }],
    });
    expect(m.workdayMinutes).toBe(8 * 60);
    expect(m.activityMinutes).toBe(6 * 60);
    expect(m.travelMinutes).toBe(60);
    expect(m.allocatedMinutes).toBe(7 * 60);
    expect(m.unallocatedMinutes).toBe(60);
    expect(m.payableMinutes).toBe(8 * 60); // ← inte 15h
  });

  it('open workday uses now()', () => {
    const now = new Date(ISO(12));
    const m = calculateDayMetrics({
      workday: { started_at: ISO(8), ended_at: null },
      now,
    });
    expect(m.workdayMinutes).toBe(4 * 60);
    expect(m.workdayOpen).toBe(true);
    expect(m.payableMinutes).toBe(4 * 60);
  });

  it('no workday → payable falls back to allocated', () => {
    const m = calculateDayMetrics({
      workday: null,
      activitySegments: [{ start: ISO(8), end: ISO(10), hours: 2 }],
      travelSegments: [{ start: ISO(10), end: ISO(11), hours: 1 }],
    });
    expect(m.workdayMinutes).toBe(0);
    expect(m.payableMinutes).toBe(3 * 60);
    expect(m.unallocatedMinutes).toBe(0);
  });

  it('over-reported activity (sum > workday) does not produce negative unallocated', () => {
    const m = calculateDayMetrics({
      workday: { started_at: ISO(8), ended_at: ISO(10) }, // 2h
      activitySegments: [{ start: ISO(8), end: ISO(12), hours: 4 }], // 4h overlap-bug
    });
    expect(m.unallocatedMinutes).toBe(0);
    expect(m.payableMinutes).toBe(2 * 60);
  });

  it('excludeFromTotals (presence-only) is dropped', () => {
    const m = calculateDayMetrics({
      workday: { started_at: ISO(8), ended_at: ISO(16) },
      activitySegments: [
        { start: ISO(8), end: ISO(12), hours: 4 },
        { start: ISO(8), end: ISO(16), hours: 8, excludeFromTotals: true },
      ],
    });
    expect(m.activityMinutes).toBe(4 * 60);
  });
});
