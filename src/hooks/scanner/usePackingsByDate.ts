import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { PackingWithBooking } from '@/types/packing';

/**
 * Resolve the calendar-anchor date for a packing job.
 * Priority: rigdaydate → eventdate → created_at (so a packing never disappears).
 */
const resolveAnchorDate = (p: PackingWithBooking): Date | null => {
  const raw = p.booking?.rigdaydate || p.booking?.eventdate || p.created_at;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? parseISO(raw) : new Date(raw);
  } catch {
    return null;
  }
};

const dateKey = (d: Date) => format(d, 'yyyy-MM-dd');

interface PackingsByDate {
  getForDate: (date: Date) => PackingWithBooking[];
  getCountForDate: (date: Date) => number;
}

export const usePackingsByDate = (packings: PackingWithBooking[]): PackingsByDate => {
  const map = useMemo(() => {
    const m = new Map<string, PackingWithBooking[]>();
    for (const p of packings) {
      const d = resolveAnchorDate(p);
      if (!d) continue;
      const key = dateKey(d);
      const arr = m.get(key);
      if (arr) arr.push(p);
      else m.set(key, [p]);
    }
    return m;
  }, [packings]);

  return useMemo(
    () => ({
      getForDate: (date: Date) => map.get(dateKey(date)) ?? [],
      getCountForDate: (date: Date) => map.get(dateKey(date))?.length ?? 0,
    }),
    [map],
  );
};

export const getPackingAnchorDate = resolveAnchorDate;
