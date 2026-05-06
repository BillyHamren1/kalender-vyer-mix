import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTeamResources } from './useTeamResources';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

/**
 * Shared logic for moving a calendar event to another team.
 * Used by both MoveDayPopover (chevrons) and EventActionPopover (team buttons).
 *
 * Mirrors calendar_events.resource_id changes; for large projects it batches
 * consolidatedEventIds, and recomputes BSA via recompute_booking_staff_for_day.
 */
export function useMoveEventToTeam(
  event: CalendarEvent,
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
  onUpdate?: () => Promise<void> | void,
) {
  const { teamResources } = useTeamResources();
  const [busy, setBusy] = useState(false);

  const teams = teamResources.filter(
    (r: any) => r.id !== 'team-11' && r.id !== 'transport',
  );

  const recompute = useCallback(async (bookingId: string, sourceDate: string) => {
    try {
      await supabase.rpc('recompute_booking_staff_for_day' as any, {
        p_booking_id: bookingId,
        p_date: sourceDate,
      });
    } catch (e) {
      console.warn('[useMoveEventToTeam] recompute failed:', e);
    }
  }, []);

  const moveOneDay = useCallback(async (newTeamId: string) => {
    if (busy) return;
    setBusy(true);
    let prevSnapshot: CalendarEvent[] | null = null;
    try {
      const sourceDate = (event as any).source_date || (typeof event.start === 'string' ? event.start : new Date(event.start).toISOString()).split('T')[0];
      const ext: any = event.extendedProps || {};
      const consolidatedEventIds: string[] = Array.isArray(ext.consolidatedEventIds)
        ? ext.consolidatedEventIds.filter(Boolean) : [];
      const consolidatedBookingIds: string[] = Array.isArray(ext.consolidatedBookingIds)
        ? ext.consolidatedBookingIds.filter(Boolean) : [];
      const isLargeProject = Boolean(ext.largeProjectId);

      if (setEvents) {
        setEvents((prev) => {
          prevSnapshot = prev;
          return prev.map((ev) => {
            const sameLargeProjectDay =
              (ev.extendedProps as any)?.largeProjectId &&
              (ev.extendedProps as any)?.largeProjectId === ext.largeProjectId &&
              ev.eventType === event.eventType &&
              (typeof ev.start === 'string' ? ev.start : new Date(ev.start as any).toISOString()).split('T')[0] === sourceDate &&
              ev.resourceId === event.resourceId;
            if (sameLargeProjectDay || ev.id === event.id) {
              return { ...ev, resourceId: newTeamId };
            }
            return ev;
          });
        });
      }

      if (isLargeProject && consolidatedEventIds.length > 0) {
        const { error } = await supabase
          .from('calendar_events')
          .update({ resource_id: newTeamId })
          .in('id', consolidatedEventIds);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('calendar_events')
          .update({ resource_id: newTeamId })
          .eq('id', event.id);
        if (error) throw error;
      }

      const bookingIdsForRecompute = isLargeProject && consolidatedBookingIds.length > 0
        ? consolidatedBookingIds
        : (event.bookingId ? [event.bookingId] : []);
      await Promise.all(bookingIdsForRecompute.map(bid => recompute(bid, sourceDate)));
      toast.success('Dagen flyttad');
      if (onUpdate) await onUpdate();
    } catch (e: any) {
      if (prevSnapshot && setEvents) setEvents(prevSnapshot);
      toast.error(e?.message || 'Kunde inte flytta dagen');
    } finally {
      setBusy(false);
    }
  }, [event, setEvents, onUpdate, recompute, busy]);

  return { teams, busy, moveOneDay, currentTeamId: event.resourceId };
}
