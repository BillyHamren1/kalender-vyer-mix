import { describe, expect, it } from 'vitest';
import { addDays, differenceInCalendarDays, endOfMonth, startOfMonth, startOfWeek } from 'date-fns';
import { getStaffAssignmentsWindow } from './staffAssignmentsWindow';

describe('staff assignment loading window', () => {
  it('shares a stable bounded cache within the viewed month', () => {
    const first = getStaffAssignmentsWindow(new Date(2026, 10, 1));
    expect(getStaffAssignmentsWindow(new Date(2026, 10, 30))).toEqual(first);
    expect(differenceInCalendarDays(new Date(first.to), new Date(first.from))).toBe(105);
  });

  it('follows historical and future navigation instead of today', () => {
    expect(getStaffAssignmentsWindow(new Date(2020, 0, 15)).bucket).toBe('2020-01');
    expect(getStaffAssignmentsWindow(new Date(2030, 11, 15)).bucket).toBe('2030-12');
    expect(getStaffAssignmentsWindow(new Date(2026, 11, 1)).bucket)
      .not.toBe(getStaffAssignmentsWindow(new Date(2026, 10, 30)).bucket);
  });

  it('includes complete six-week month grids across leap years and year boundaries', () => {
    for (const year of [2024, 2026, 2027]) {
      for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 15);
        const window = getStaffAssignmentsWindow(date);
        const gridStart = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
        const gridEnd = addDays(gridStart, 41);
        expect(new Date(window.from).getTime()).toBeLessThanOrEqual(gridStart.getTime());
        expect(new Date(window.to).getTime()).toBeGreaterThanOrEqual(gridEnd.getTime());
        expect(new Date(window.to).getTime()).toBeGreaterThanOrEqual(endOfMonth(date).getTime());
      }
    }
  });
});
