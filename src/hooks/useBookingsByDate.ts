import { useMemo } from 'react';
import type { ScheduledShift } from '@/services/mobileApiService';
import { extractUTCDate, parsePlannerDateTime } from '@/utils/dateUtils';

export type DateKey = string; // YYYY-MM-DD

const keyOf = (d: Date | string): DateKey => {
  if (typeof d === 'string') return extractUTCDate(d);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export interface ShiftsByDate {
  map: Map<DateKey, ScheduledShift[]>;
  getForDate: (d: Date) => ScheduledShift[];
  getCountForDate: (d: Date) => number;
  hasAnyInRange: (start: Date, end: Date) => boolean;
}

/**
 * Groups scheduled shifts by their start_time calendar date (local).
 * Pure client-side derivation — no extra network requests.
 */
export function useShiftsByDate(shifts: ScheduledShift[]): ShiftsByDate {
  return useMemo(() => {
    const map = new Map<DateKey, ScheduledShift[]>();
    for (const s of shifts) {
      const k = keyOf(s.start_time);
      const arr = map.get(k);
      if (arr) arr.push(s);
      else map.set(k, [s]);
    }
    // Sort each day by start_time ascending
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aTime = parsePlannerDateTime(a.start_time)?.getTime() ?? 0;
        const bTime = parsePlannerDateTime(b.start_time)?.getTime() ?? 0;
        return aTime - bTime;
      });
    }
    return {
      map,
      getForDate: (d: Date) => map.get(keyOf(d)) || [],
      getCountForDate: (d: Date) => (map.get(keyOf(d))?.length ?? 0),
      hasAnyInRange: (start: Date, end: Date) => {
        for (const k of map.keys()) {
          if (k >= keyOf(start) && k <= keyOf(end)) return true;
        }
        return false;
      },
    };
  }, [shifts]);
}

export { keyOf as dateKey };
