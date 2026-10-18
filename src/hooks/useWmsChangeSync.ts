import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  affectedFromEvents, catchUp, isChangefeedMissing, mergeRange, packingsToReload, readHead,
  type FetchChangePage, type WmsChangeEvent,
} from '@/lib/warehouse/wmsChangefeed';
import { computeAttention, fetchOpsRange, type OpsMode, type OpsRangeData } from '@/hooks/useWarehouseOpsRange';
import { parseISO } from 'date-fns';

export type ChangeSyncState = 'unknown' | 'ready' | 'unsupported' | 'error';

/** Cursor per org+actor; never shared across tenants or users. */
const cursors = new Map<string, number>();

const fetchPage: FetchChangePage = async (after, limit) => {
  const { data, error } = await (supabase.rpc as any)('wms_changes_since', { p_after: after, p_limit: limit });
  if (error) throw error;
  return data as { head: number; retainedFrom: number; events: WmsChangeEvent[] };
};

async function applyToOpsCache(qc: QueryClient, orgId: string, events: WmsChangeEvent[]) {
  const affected = affectedFromEvents(events);
  if (affected.personnelChanged) {
    // Små, org-scopade läsmodeller; invalideras bara när de faktiskt berörs.
    await qc.invalidateQueries({ queryKey: ['warehouse-personnel-week', orgId] });
    await qc.invalidateQueries({ queryKey: ['warehouse-card-event-crew'] });
  }
  let bookingPackings: string[] = [];
  if (affected.bookingIds.size) {
    const { data, error } = await supabase.from('packing_projects').select('id')
      .eq('organization_id', orgId).in('booking_id', [...affected.bookingIds]);
    if (error) throw error;
    bookingPackings = (data || []).map((r: any) => r.id);
  }
  const entries = qc.getQueriesData<OpsRangeData>({ queryKey: ['warehouse-ops-range', orgId] });
  await Promise.all(entries.map(async ([key, cached]) => {
    if (!cached) return;
    const [, , , day, mode] = key as [string, string, string, string, OpsMode];
    const anchor = parseISO(day);
    const reload = packingsToReload(cached.jobs, affected, bookingPackings);
    if (!reload.length) return;
    const fresh = await fetchOpsRange(orgId, anchor, mode, reload);
    const merged = mergeRange(cached, reload, fresh);
    const attention = computeAttention(merged.jobs, merged.scans, cached.shifts, anchor);
    qc.setQueryData<OpsRangeData>(key, {
      ...merged,
      attention,
      summary: {
        ...cached.summary,
        jobsOut: merged.jobs.filter((j) => j.direction === 'out').length,
        jobsIn: merged.jobs.filter((j) => j.direction === 'in').length,
        lastScanAt: merged.scans.reduce<string | null>((a, s) => (a && a > s.createdAt ? a : s.createdAt), null),
      },
    });
  }));
}

/**
 * Durable delta sync for WMS read models. Realtime on the per-org cursor row is a
 * wake-up only; reconnect, visibility return and manual refresh all catch up.
 * Returns `ready` once the head cursor was read (bootstrap snapshots must wait for it).
 */
export function useWmsChangeSync(orgId: string | null, userId: string | null) {
  const qc = useQueryClient();
  const key = orgId && userId ? `${orgId}:${userId}` : null;
  const [state, setState] = useState<ChangeSyncState>('unknown');
  const running = useRef(false);
  const again = useRef(false);

  const sync = useCallback(async () => {
    if (!key || !orgId) return;
    if (running.current) { again.current = true; return; }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { again.current = true; return; }
    running.current = true;
    try {
      do {
        again.current = false;
        const cursor = cursors.get(key);
        if (cursor === undefined) { cursors.set(key, await readHead(fetchPage)); setState('ready'); continue; }
        const res = await catchUp(cursor, fetchPage, (ev) => applyToOpsCache(qc, orgId, ev));
        if (res.kind === 'reset') await qc.invalidateQueries({ queryKey: ['warehouse-ops-range', orgId] });
        cursors.set(key, res.cursor);
        setState('ready');
      } while (again.current);
    } catch (err) {
      setState(isChangefeedMissing(err) ? 'unsupported' : 'error');
    } finally {
      running.current = false;
    }
  }, [key, orgId, qc]);

  useEffect(() => {
    if (!key || !orgId) return;
    setState(cursors.has(key) ? 'ready' : 'unknown');
    void sync();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wake = () => { if (!timer) timer = setTimeout(() => { timer = null; void sync(); }, 300); };
    const channel = supabase.channel(`wms-cursor-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wms_change_cursors', filter: `organization_id=eq.${orgId}` }, wake)
      .subscribe((status) => { if (status === 'SUBSCRIBED') wake(); }); // includes reconnects
    const onVisible = () => { if (document.visibilityState === 'visible' && again.current) wake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [key, orgId, sync]);

  return { state, catchUp: sync };
}
