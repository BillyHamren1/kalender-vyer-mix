import { useState } from 'react';
import { updateCalendarEvent } from '@/services/eventService';
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

      // Resource (team) change
      if (info.newResource && info.oldResource?.id !== info.newResource.id) {
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

      // Persist to DB (FullCalendar already shows the new position optimistically)
      await updateCalendarEvent(info.event.id, eventData);

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
