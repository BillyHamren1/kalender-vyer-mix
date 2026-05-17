/**
 * useStaffGanttMirror — hämtar samma engine-data som admin (`get-staff-
 * presence-day`) + fas-map (calendar_events) för EN personal + ETT datum,
 * och bygger en GanttBlock-lista som är bit-för-bit identisk med
 * `/staff-management/time-reports`-Gantten.
 *
 * Används av mobila tidslinjen (StaffGanttMirrorTimeline) så att appen
 * speglar admin-vyn 1:1.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCalendarPhase } from '@/lib/staff/ganttPhaseColor';
import {
  buildStaffGanttMirrorBlocks,
  type BuildStaffGanttMirrorResult,
} from '@/lib/staff/buildStaffGanttMirrorBlocks';

interface PhaseMaps {
  bookingPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'>;
  largeProjectPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'>;
}

const PRIORITY: Record<'rig' | 'event' | 'rigdown', number> = {
  rig: 3,
  rigdown: 2,
  event: 1,
};

async function fetchPhaseMaps(dateStr: string): Promise<PhaseMaps> {
  const startIso = `${dateStr}T00:00:00.000Z`;
  const endIso = `${dateStr}T23:59:59.999Z`;
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('booking_id, event_type, start_time')
    .gte('start_time', startIso)
    .lte('start_time', endIso);
  if (error || !events) {
    return { bookingPhaseByDate: {}, largeProjectPhaseByDate: {} };
  }
  const bookingPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'> = {};
  for (const r of events as any[]) {
    const bid = r.booking_id as string | null;
    const et = normalizeCalendarPhase(r.event_type);
    if (!bid || !et) continue;
    const existing = bookingPhaseByDate[bid];
    if (!existing || PRIORITY[et] > PRIORITY[existing]) bookingPhaseByDate[bid] = et;
  }
  const bookingIds = Object.keys(bookingPhaseByDate);
  const largeProjectPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'> = {};
  if (bookingIds.length > 0) {
    const { data: bks } = await supabase
      .from('bookings')
      .select('id, large_project_id')
      .in('id', bookingIds);
    for (const b of (bks ?? []) as any[]) {
      const lpId = b.large_project_id as string | null;
      if (!lpId) continue;
      const phase = bookingPhaseByDate[b.id];
      if (!phase) continue;
      const existing = largeProjectPhaseByDate[lpId];
      if (!existing || PRIORITY[phase] > PRIORITY[existing]) {
        largeProjectPhaseByDate[lpId] = phase;
      }
    }
  }
  return { bookingPhaseByDate, largeProjectPhaseByDate };
}

export interface UseStaffGanttMirrorOptions {
  staffId: string | null | undefined;
  date: string;
  staffName?: string | null;
  enabled?: boolean;
}

export function useStaffGanttMirror(opts: UseStaffGanttMirrorOptions) {
  const { staffId, date, staffName, enabled = true } = opts;

  const presenceQuery = useQuery({
    queryKey: ['mobile-staff-gantt-mirror', 'presence', staffId, date],
    enabled: enabled && !!staffId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-staff-presence-day', {
        body: { staffId, date },
      });
      if (error) throw new Error(error.message);
      if (data && (data as any).ok === false) {
        throw new Error((data as any).error ?? 'presence_day_failed');
      }
      return data as any;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const phaseQuery = useQuery({
    queryKey: ['mobile-staff-gantt-mirror', 'phase', date],
    enabled: enabled && !!date,
    queryFn: () => fetchPhaseMaps(date),
    staleTime: 60_000,
  });

  const isLoading = presenceQuery.isLoading || phaseQuery.isLoading;
  const error = presenceQuery.error ?? phaseQuery.error ?? null;

  let result: BuildStaffGanttMirrorResult = {
    blocks: [],
    source: 'none',
    counts: { rawV2: 0, mappedV2: 0, rawAlloc: 0, mappedAlloc: 0, legacy: 0, rendered: 0 },
  };

  if (presenceQuery.data) {
    result = buildStaffGanttMirrorBlocks({
      staffName: staffName ?? '',
      dateStr: date,
      presenceDay: {
        reportCandidateBlocks: presenceQuery.data.reportCandidateBlocks,
        displayTimelineBlocksV2: presenceQuery.data.displayTimelineBlocksV2,
        workdayAllocationSegments: presenceQuery.data.workdayAllocationSegments,
        presenceBlocks: presenceQuery.data.presenceBlocks,
        targets: presenceQuery.data.targets,
      },
      bookingPhaseByDate: phaseQuery.data?.bookingPhaseByDate,
      largeProjectPhaseByDate: phaseQuery.data?.largeProjectPhaseByDate,
    });
  }

  return {
    blocks: result.blocks,
    source: result.source,
    counts: result.counts,
    isLoading,
    error: error as Error | null,
    refetch: async () => {
      await Promise.all([presenceQuery.refetch(), phaseQuery.refetch()]);
    },
  };
}
