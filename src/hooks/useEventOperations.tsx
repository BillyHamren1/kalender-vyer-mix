import { useState } from 'react';
import { updateCalendarEvent } from '@/services/eventService';
import { type LargeProjectPhase } from '@/services/largeProjectPlannerService';
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import { toast } from 'sonner';

export const useEventOperations = ({ 
  resources, 
  refreshEvents 
}: { 
  resources: Resource[], 
  refreshEvents?: () => Promise<void | CalendarEvent[]> 
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  // Optimistic event change handler — FullCalendar already updates the DOM,
  // so we only need to persist and revert on failure.
  const handleEventChange = async (info: any) => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const eventData: Partial<CalendarEvent> = {};
      let changeDescription = '';
      const oldDate = info.oldEvent?.start
        ? new Date(info.oldEvent.start).toISOString().slice(0, 10)
        : null;
      const newDate = info.event.start
        ? new Date(info.event.start).toISOString().slice(0, 10)
        : oldDate;
      const teamChanged = !!info.newResource && info.oldResource?.id !== info.newResource.id;
      const largeProjectId = (info.event.extendedProps as any)?.largeProjectId
        || (info.oldEvent?.extendedProps as any)?.largeProjectId;
      const largeProjectPhase = ((info.event.extendedProps as any)?.eventType
        || (info.event.extendedProps as any)?.phase
        || (info.oldEvent?.extendedProps as any)?.eventType
        || (info.oldEvent?.extendedProps as any)?.phase) as LargeProjectPhase | undefined;
      const dateChanged = Boolean(oldDate && newDate && oldDate !== newDate);
      const startChanged = Boolean(info.event.start && info.oldEvent?.start?.getTime() !== info.event.start.getTime());
      const endChanged = Boolean(info.event.end && info.oldEvent?.end?.getTime() !== info.event.end.getTime());

      // Resource (team) change
      if (teamChanged) {
        eventData.resourceId = info.newResource.id;
        const oldTeam = resources.find(r => r.id === info.oldResource?.id)?.title || info.oldResource?.id;
        const newTeam = resources.find(r => r.id === info.newResource.id)?.title || info.newResource.id;
        changeDescription = `Flyttad från ${oldTeam} till ${newTeam}`;
      }

      // Time changes
      if (info.event.start && info.oldEvent?.start?.getTime() !== info.event.start.getTime()) {
        eventData.start = info.event.start.toISOString();
      }
      if (info.event.end && info.oldEvent?.end?.getTime() !== info.event.end.getTime()) {
        eventData.end = info.event.end.toISOString();
      }

      if (Object.keys(eventData).length === 0) {
        setIsUpdating(false);
        return;
      }

      // Calendar placement (both normal bookings and large projects) is
      // driven by calendar_events.resource_id. large_project_team_assignments
      // is NOT authoritative for planner placement — any team change must be
      // mirrored to calendar_events.resource_id, otherwise the tile snaps
      // back on refresh.
      const consolidatedEventIds: string[] = Array.isArray(
        (info.event.extendedProps as any)?.consolidatedEventIds
      ) ? (info.event.extendedProps as any).consolidatedEventIds.filter(Boolean) : [];
      const consolidatedBookingIds: string[] = Array.isArray(
        (info.event.extendedProps as any)?.consolidatedBookingIds
      ) ? (info.event.extendedProps as any).consolidatedBookingIds.filter(Boolean) : [];

      let updated: any = null;

      // Effective resource for the move: new column if team changed,
      // otherwise the existing column. Personal calendar rule: team is
      // day-specific, so resource_id MUST be re-persisted on any date move.
      const effectiveResourceId: string | undefined =
        info.newResource?.id
          || (typeof info.event.getResources === 'function' ? info.event.getResources()[0]?.id : undefined)
          || (info.event.extendedProps as any)?.resourceId;

      // Large-project tile = consolidated (project, phase, date, team) group.
      // Mutate the WHOLE group on any team OR date change.
      const lpGroupMove = !!largeProjectId && (teamChanged || dateChanged);

      if (lpGroupMove && consolidatedEventIds.length > 0) {
        const updatePatch: any = {};
        if (effectiveResourceId) updatePatch.resource_id = effectiveResourceId;
        if (eventData.start) updatePatch.start_time = eventData.start;
        if (eventData.end) updatePatch.end_time = eventData.end;
        if (dateChanged && newDate) updatePatch.source_date = newDate;
        const { error: updErr } = await supabase
          .from('calendar_events')
          .update(updatePatch)
          .in('id', consolidatedEventIds);
        if (updErr) throw updErr;

        if (import.meta.env.DEV) {
          console.info('[calendar-team-change] large project', {
            eventId: info.event.id,
            largeProjectId,
            phase: largeProjectPhase,
            sourceDate: oldDate,
            targetDate: newDate,
            oldTeamId: info.oldResource?.id,
            newTeamId: effectiveResourceId,
            updatedEventIds: consolidatedEventIds,
            dateChanged,
            teamChanged,
            ranRecompute: true,
          });
        }
      } else {
        // PERSONALKALENDER-REGEL: vid datumflytt MÅSTE resource_id alltid
        // sparas tillsammans med start/end, även om FullCalendar inte ser
        // teamet som "ändrat" (samma kolumn på ny dag = nytt dagsteam).
        if (dateChanged && effectiveResourceId && !eventData.resourceId) {
          eventData.resourceId = effectiveResourceId;
        }
        updated = await updateCalendarEvent(info.event.id, eventData);
        if (import.meta.env.DEV && (teamChanged || dateChanged)) {
          console.info('[calendar-team-change] normal booking', {
            eventId: info.event.id,
            bookingId: (updated as any)?.bookingId,
            largeProjectId,
            phase: largeProjectPhase,
            sourceDate: oldDate,
            targetDate: newDate,
            oldTeamId: info.oldResource?.id,
            newTeamId: effectiveResourceId,
            updatedEventIds: [info.event.id],
            dateChanged,
            teamChanged,
            ranRecompute: true,
          });
        }
      }

      // Räkna om BSA för (booking, datum) för båda dagarna som potentiellt
      // berördes — säkerställer att personalen härleds från staff_assignments ×
      // calendar_events.resource_id (team-modellen).
      try {
        const bookingIdCandidates = consolidatedBookingIds.length > 0
          ? consolidatedBookingIds
          : [
              (info.event.extendedProps as any)?.booking_id
                || (info.event.extendedProps as any)?.bookingId
                || updated?.bookingId,
            ].filter(Boolean) as string[];
        if (bookingIdCandidates.length > 0) {
          const dates = Array.from(new Set([oldDate, newDate].filter(Boolean))) as string[];
          await Promise.all(bookingIdCandidates.flatMap(bid =>
            dates.map(d =>
              supabase.rpc('recompute_booking_staff_for_day' as any, {
                p_booking_id: bid,
                p_date: d,
              })
            )
          ));
        }
      } catch (rpcErr) {
        console.warn('[useEventOperations] BSA recompute failed (non-fatal)', rpcErr);
      }

      toast.success(changeDescription || 'Händelse uppdaterad');

      // Do NOT call refreshEvents here — realtime subscription handles state updates.
      // Calling refreshEvents causes a full re-fetch that makes the screen blink.
    } catch (error) {
      console.error('Error updating event:', error);
      // Revert the visual change on failure
      info.revert();
      toast.error('Kunde inte uppdatera händelsen. Försök igen.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEventReceive = async (info: any) => {
    // Let realtime handle the state update; only force refresh as fallback
    if (refreshEvents) {
      // Small delay to let realtime arrive first
      setTimeout(() => refreshEvents(), 1500);
    }
  };

  return {
    handleEventChange,
    handleEventReceive,
    isUpdating
  };
};
