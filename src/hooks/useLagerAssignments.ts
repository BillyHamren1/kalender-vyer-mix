/**
 * useLagerAssignments — light wrapper around mobileApi.getLagerAssignments.
 *
 * Returns the canonical list (warehouse_assignments + project_tasks +
 * legacy warehouse_calendar_events) the Time-app uses to render the Lager
 * card on the day overview and the Lager detail page.
 */
import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { WAREHOUSE_TIME_ZONE, warehouseDateOf, warehouseDayBounds } from '@/lib/warehouse/warehouseTime';
import { mobileApi } from '@/services/mobileApiService';

export type LagerAssignmentItem = NonNullable<
  Awaited<ReturnType<typeof mobileApi.getLagerAssignments>>['assignments']
>[number];

/** A date is a Stockholm day; ISO intervals may continue from the previous day. */
export function warehouseAssignmentOnDate(item: Pick<LagerAssignmentItem, 'start_time' | 'end_time' | 'date'>, date: string): boolean {
  const timestamp = (value: string | null | undefined) => value && /^\d{4}-\d{2}-\d{2}[T ]/.test(value)
    ? DateTime.fromISO(value.replace(' ', 'T'), { zone: WAREHOUSE_TIME_ZONE }) : null;
  const start = timestamp(item.start_time), end = timestamp(item.end_time);
  if (start?.isValid && end?.isValid && end > start) {
    const bounds = warehouseDayBounds(date);
    return start.toMillis() < Date.parse(bounds.end) && end.toMillis() > Date.parse(bounds.start);
  }
  if (start?.isValid) return warehouseDateOf(item.start_time) === date;
  // Untimed assignments and legacy SQL time-only values retain their explicit day.
  return item.date === date;
}

interface Options {
  /** YYYY-MM-DD — narrows the returned list to a single day. */
  date?: string;
}

export function useLagerAssignments(options: Options = {}) {
  const { date } = options;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LagerAssignmentItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = date ? { date_from: date, date_to: date } : undefined;
        const res = await mobileApi.getLagerAssignments(params);
        if (cancelled) return;
        setItems(res.assignments || []);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          console.error('[useLagerAssignments] failed', e);
          setError(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  const filtered = useMemo(() => {
    if (!date) return items;
    return items.filter((a) => warehouseAssignmentOnDate(a, date));
  }, [items, date]);

  return {
    assignments: filtered,
    loading,
    error,
    refresh: () => setReloadKey((k) => k + 1),
  };
}
