/**
 * useProjectCalendarDays
 * --------------------------------------------------------------------------
 * Read calendar_events for a project (single booking, large project with many
 * sibling bookings, or standalone project where booking_id = `project-<uuid>`)
 * and keep them live via Supabase Realtime.
 *
 * Used by ProjectCalendarView to determine which days to render in the
 * project calendar (a filtered lens over the staff calendar's CustomCalendar).
 * Same source of truth as personalkalendern. Writes go through the standard
 * eventService path which mirrors via timeSync.syncFromCalendarEvent so
 * siblings stay in lockstep (see mem://features/planning/phase-time-sync-v1).
 *
 * Renamed from useProjectGanttEvents — there is no longer a Gantt UI.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProjectCalendarPhase = 'rig' | 'event' | 'rigDown';

export interface ProjectCalendarEvent {
  id: string;
  booking_id: string;
  event_type: ProjectCalendarPhase;
  source_date: string;        // YYYY-MM-DD
  start_time: string;         // ISO
  end_time: string;           // ISO
  resource_id: string | null;
  delivery_address: string | null;
  booking_number: string | null;
  title: string | null;
}

export interface UseProjectCalendarDaysArgs {
  projectId: string | null | undefined;       // medium project id (UUID) OR large_project_id
  bookingId?: string | null;                  // optional explicit booking id (single project)
  isLargeProject?: boolean;
}

interface ResolvedScope {
  bookingIds: string[];                       // real booking UUIDs to query
  standaloneBookingId: string | null;         // `project-<uuid>` fallback
}

async function resolveScope(args: UseProjectCalendarDaysArgs): Promise<ResolvedScope> {
  const { projectId, bookingId, isLargeProject } = args;
  if (!projectId) return { bookingIds: [], standaloneBookingId: null };

  // Large project — fan out to sibling bookings.
  if (isLargeProject) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('large_project_id', projectId);
    if (error) {
      console.warn('[useProjectCalendarDays] sibling lookup failed', error);
      return { bookingIds: [], standaloneBookingId: null };
    }
    return {
      bookingIds: (data || []).map((b) => b.id).filter(Boolean) as string[],
      standaloneBookingId: null,
    };
  }

  // Medium / single — explicit bookingId wins, otherwise look up the project.
  if (bookingId) return { bookingIds: [bookingId], standaloneBookingId: null };

  // Standalone fallback (no booking link). projectCalendarService writes
  // calendar_events with booking_id = `project-<uuid>`.
  return { bookingIds: [], standaloneBookingId: `project-${projectId}` };
}

export function useProjectCalendarDays(args: UseProjectCalendarDaysArgs) {
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ['project-calendar-days', args.projectId, args.bookingId ?? null, args.isLargeProject ?? false],
    [args.projectId, args.bookingId, args.isLargeProject],
  );

  const query = useQuery({
    queryKey,
    enabled: !!args.projectId,
    queryFn: async (): Promise<{ scope: ResolvedScope; events: ProjectCalendarEvent[] }> => {
      const scope = await resolveScope(args);

      const allIds = [
        ...scope.bookingIds,
        ...(scope.standaloneBookingId ? [scope.standaloneBookingId] : []),
      ];
      if (allIds.length === 0) return { scope, events: [] };

      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, booking_id, event_type, source_date, start_time, end_time, resource_id, delivery_address, booking_number, title')
        .in('booking_id', allIds)
        .in('event_type', ['rig', 'event', 'rigDown'])
        .order('source_date', { ascending: true });

      if (error) {
        console.error('[useProjectCalendarDays] fetch failed', error);
        throw error;
      }

      const realEvents = (data || []) as ProjectCalendarEvent[];

      // Fallback: bygg syntetiska faseventer från bookings.rigdaydate/eventdate/
      // rigdowndate för (booking_id, phase, date)-kombinationer som saknar rad
      // i calendar_events. Säkerställer att projektkalendern alltid har dagar
      // även när calendar_events inte hunnit synkas (samma fallback som
      // useRealTimeCalendarEvents använder för personalkalendern).
      const realKeys = new Set(
        realEvents
          .filter((e) => e.booking_id && e.source_date && e.event_type)
          .map((e) => `${e.booking_id}|${e.event_type}|${e.source_date}`),
      );

      let syntheticEvents: ProjectCalendarEvent[] = [];
      if (scope.bookingIds.length > 0) {
        const { data: bookingRows, error: bookingErr } = await supabase
          .from('bookings')
          .select('id, rigdaydate, eventdate, rigdowndate')
          .in('id', scope.bookingIds);
        if (bookingErr) {
          console.warn('[useProjectCalendarDays] booking fallback failed', bookingErr);
        } else {
          const phaseMap: Array<{ phase: ProjectCalendarPhase; col: 'rigdaydate' | 'eventdate' | 'rigdowndate' }> = [
            { phase: 'rig', col: 'rigdaydate' },
            { phase: 'event', col: 'eventdate' },
            { phase: 'rigDown', col: 'rigdowndate' },
          ];
          for (const b of bookingRows || []) {
            for (const { phase, col } of phaseMap) {
              const raw = (b as any)[col];
              if (!raw) continue;
              const dateStr = String(raw).slice(0, 10);
              const key = `${b.id}|${phase}|${dateStr}`;
              if (realKeys.has(key)) continue;
              syntheticEvents.push({
                id: `synthetic-${b.id}-${phase}-${dateStr}`,
                booking_id: b.id,
                event_type: phase,
                source_date: dateStr,
                start_time: `${dateStr}T00:00:00Z`,
                end_time: `${dateStr}T00:00:00Z`,
                resource_id: null,
                delivery_address: null,
                booking_number: null,
                title: null,
              });
            }
          }
        }
      }

      const merged = [...realEvents, ...syntheticEvents].sort((a, b) =>
        a.source_date.localeCompare(b.source_date),
      );

      return {
        scope,
        events: merged,
      };
    },
  });

  const idsKey = (query.data?.scope.bookingIds.join(',') ?? '') +
    '|' + (query.data?.scope.standaloneBookingId ?? '');

  useEffect(() => {
    const ids = [
      ...(query.data?.scope.bookingIds ?? []),
      ...(query.data?.scope.standaloneBookingId ? [query.data.scope.standaloneBookingId] : []),
    ];
    if (ids.length === 0) return;

    const channel = supabase
      .channel(`project-calendar-${args.projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `booking_id=in.(${ids.map((i) => `"${i}"`).join(',')})`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, args.projectId]);

  return {
    events: query.data?.events ?? [],
    bookingIds: query.data?.scope.bookingIds ?? [],
    standaloneBookingId: query.data?.scope.standaloneBookingId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
