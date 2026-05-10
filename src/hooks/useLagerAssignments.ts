/**
 * useLagerAssignments — light wrapper around mobileApi.getLagerAssignments.
 *
 * Returns the canonical list (warehouse_assignments + project_tasks +
 * legacy warehouse_calendar_events) the Time-app uses to render the Lager
 * card on the day overview and the Lager detail page.
 */
import { useEffect, useMemo, useState } from 'react';
import { mobileApi } from '@/services/mobileApiService';

export type LagerAssignmentItem = NonNullable<
  Awaited<ReturnType<typeof mobileApi.getLagerAssignments>>['assignments']
>[number];

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
    return items.filter((a) => (a.start_time || '').slice(0, 10) === date);
  }, [items, date]);

  return {
    assignments: filtered,
    loading,
    error,
    refresh: () => setReloadKey((k) => k + 1),
  };
}
