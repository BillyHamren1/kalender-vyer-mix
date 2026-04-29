import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { PackingWithBooking } from '@/types/packing';

export type PackingEntryKind = 'out' | 'in';

export interface PackingEntry {
  packing: PackingWithBooking;
  kind: PackingEntryKind;
}

const parseDate = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? parseISO(raw) : new Date(raw);
  } catch {
    return null;
  }
};

/**
 * Out-anchor: when the packing should appear as a packing/loadout job.
 * Priority: rigdaydate → eventdate → created_at (so it never disappears).
 */
const resolveOutAnchor = (p: PackingWithBooking): Date | null =>
  parseDate(p.booking?.rigdaydate) ||
  parseDate(p.booking?.eventdate) ||
  parseDate(p.created_at);

/**
 * In-anchor: when the packing should appear as a return/IN job. Only
 * emitted once the packing is out (delivered) or already being returned.
 * Priority: rigdowndate → eventdate (fallback so we never lose it).
 */
const resolveInAnchor = (p: PackingWithBooking): Date | null => {
  const isReturnable =
    p.status === 'delivered' ||
    p.status === 'back' ||
    p.status === 'returning' ||
    p.status === 'returned';
  if (!isReturnable) return null;
  return (
    parseDate(p.booking?.rigdowndate) ||
    parseDate(p.booking?.eventdate) ||
    null
  );
};

const dateKey = (d: Date) => format(d, 'yyyy-MM-dd');

interface PackingsByDate {
  getForDate: (date: Date) => PackingEntry[];
  getCountForDate: (date: Date) => number;
  /** Flat list of every (packing, kind) entry — useful for search results. */
  allEntries: PackingEntry[];
}

export const usePackingsByDate = (packings: PackingWithBooking[]): PackingsByDate => {
  const { map, all } = useMemo(() => {
    const m = new Map<string, PackingEntry[]>();
    const flat: PackingEntry[] = [];

    const push = (entry: PackingEntry, anchor: Date) => {
      const key = dateKey(anchor);
      const arr = m.get(key);
      if (arr) arr.push(entry);
      else m.set(key, [entry]);
      flat.push(entry);
    };

    for (const p of packings) {
      const out = resolveOutAnchor(p);
      // OUT entry: only meaningful while the packing is being prepared / loaded out.
      const showOut =
        p.status === 'planning' ||
        p.status === 'in_progress' ||
        p.status === 'packed';
      if (out && showOut) push({ packing: p, kind: 'out' }, out);

      const inAnchor = resolveInAnchor(p);
      if (inAnchor) push({ packing: p, kind: 'in' }, inAnchor);
    }
    return { map: m, all: flat };
  }, [packings]);

  return useMemo(
    () => ({
      getForDate: (date: Date) => map.get(dateKey(date)) ?? [],
      getCountForDate: (date: Date) => map.get(dateKey(date))?.length ?? 0,
      allEntries: all,
    }),
    [map, all],
  );
};

// Back-compat helper used elsewhere — returns the OUT anchor.
export const getPackingAnchorDate = resolveOutAnchor;
