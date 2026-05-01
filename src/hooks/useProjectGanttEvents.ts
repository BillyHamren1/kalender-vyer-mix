/**
 * useProjectGanttEvents
 * --------------------------------------------------------------------------
 * Read calendar_events for a project (single booking, large project with many
 * sibling bookings, or standalone project where booking_id = `project-<uuid>`)
 * and keep them live via Supabase Realtime.
 *
 * The Gantt UI consumes the returned `events` array directly — same source of
 * truth as the staff calendar. Writes go through `eventService.updateCalendarEvent`
 * which already mirrors via `timeSync.syncFromCalendarEvent` so siblings stay
 * in lockstep (see mem://features/planning/phase-time-sync-v1).
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type GanttPhase = 'rig' | 'event' | 'rigDown';

export interface GanttCalendarEvent {
  id: string;
  booking_id: string;
  event_type: GanttPhase;
  source_date: string;        // YYYY-MM-DD
  start_time: string;         // ISO
  end_time: string;           // ISO
  resource_id: string | null;
  delivery_address: string | null;
  booking_number: string | null;
  title: string | null;
}

export interface UseProjectGanttEventsArgs {
  projectId: string | null | undefined;       // medium project id (UUID) OR large_project_id
  bookingId?: string | null;                  // optional explicit booking id (single project)
  isLargeProject?: boolean;
}

interface ResolvedScope {
  bookingIds: string[];                       // real booking UUIDs to query
  standaloneBookingId: string | null;         // `project-<uuid>` fallback
}

async function resolveScope(args: UseProjectGanttEventsArgs): Promise<ResolvedScope> {
  const { projectId, bookingId, isLargeProject } = args;
  if (!projectId) return { bookingIds: [], standaloneBookingId: null };

  // Large project — fan out to sibling bookings.
  if (isLargeProject) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('large_project_id', projectId);
    if (error) {
      console.warn('[useProjectGanttEvents] sibling lookup failed', error);
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

export function useProjectGanttEvents(args: UseProjectGanttEventsArgs) {
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ['project-gantt-events', args.projectId, args.bookingId ?? null, args.isLargeProject ?? false],
    [args.projectId, args.bookingId, args.isLargeProject],
  );

  const query = useQuery({
    queryKey,
    enabled: !!args.projectId,
    queryFn: async (): Promise<{ scope: ResolvedScope; events: GanttCalendarEvent[] }> => {
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
        console.error('[useProjectGanttEvents] fetch failed', error);
        throw error;
      }

      const realEvents = (data || []) as GanttCalendarEvent[];

      // Synthesize EVENT-day rows from bookings.eventdate.
      // Personalkalendern sparar inte eventdagen i calendar_events
      // (mem://features/planning/staff-calendar-no-event-day-v1), men
      // projektkalendern SKA visa den. Vi syntetiserar en virtuell rad per
      // booking, placerad på samma resource_id (team) som rig-raden.
      if (scope.bookingIds.length > 0) {
        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('id, booking_number, eventdate, event_start_time, event_end_time, deliveryaddress, client')
          .in('id', scope.bookingIds);

        const rigByBooking = new Map<string, GanttCalendarEvent>();
        for (const ev of realEvents) {
          if (ev.event_type === 'rig' && !rigByBooking.has(ev.booking_id)) {
            rigByBooking.set(ev.booking_id, ev);
          }
        }
        const hasEventRow = new Set(
          realEvents.filter((e) => e.event_type === 'event').map((e) => `${e.booking_id}|${e.source_date}`),
        );

        for (const b of bookingRows || []) {
          if (!b.eventdate) continue;
          const key = `${b.id}|${b.eventdate}`;
          if (hasEventRow.has(key)) continue;

          const rig = rigByBooking.get(b.id);
          const startHHMM = (b.event_start_time as string | null)?.slice(0, 5) || '09:00';
          const endHHMM = (b.event_end_time as string | null)?.slice(0, 5) || '17:00';

          realEvents.push({
            id: `virtual-event-${b.id}-${b.eventdate}`,
            booking_id: b.id,
            event_type: 'event',
            source_date: b.eventdate as string,
            start_time: `${b.eventdate}T${startHHMM}:00`,
            end_time: `${b.eventdate}T${endHHMM}:00`,
            resource_id: rig?.resource_id ?? null,
            delivery_address: (b.deliveryaddress as string | null) ?? rig?.delivery_address ?? null,
            booking_number: (b.booking_number as string | null) ?? rig?.booking_number ?? null,
            title: (b.client as string | null) ?? rig?.title ?? null,
          });
        }
        realEvents.sort((a, b) => a.source_date.localeCompare(b.source_date));
      }

      return { scope, events: realEvents };
    },
  });

  // Realtime: re-fetch whenever any of these booking_ids change.
  const idsKey = (query.data?.scope.bookingIds.join(',') ?? '') +
    '|' + (query.data?.scope.standaloneBookingId ?? '');

  useEffect(() => {
    const ids = [
      ...(query.data?.scope.bookingIds ?? []),
      ...(query.data?.scope.standaloneBookingId ? [query.data.scope.standaloneBookingId] : []),
    ];
    if (ids.length === 0) return;

    const channel = supabase
      .channel(`project-gantt-${args.projectId}`)
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
