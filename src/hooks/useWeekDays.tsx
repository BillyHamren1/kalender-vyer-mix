import { useMemo } from 'react';

/**
 * Generates an array of 7 Date objects starting from the given week start date.
 * Memoized on the timestamp to prevent unnecessary recalculations.
 */
export const useWeekDays = (weekStart: Date): Date[] => {
  const weekStartTime = weekStart.getTime();
  return useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return date;
    });
  }, [weekStartTime]);
};
