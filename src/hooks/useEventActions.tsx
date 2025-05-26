
import { useEffect } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { Resource } from '@/components/Calendar/ResourceData';
import { useAddEvent } from '@/hooks/useAddEvent';
import { useDuplicateEvent } from '@/hooks/useDuplicateEvent';
import { findAvailableTeam } from '@/utils/teamAvailability';

export const useEventActions = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>, 
  resources: Resource[]
) => {
  // Use our modular hooks with proper refresh callback
  const refreshEvents = () => {
    // This would typically refetch events, but for now we'll just call setEvents
    // In a real implementation, this should refetch from the database
  };

  const { addEventToCalendar } = useAddEvent(resources, refreshEvents);
  const { duplicateEvent } = useDuplicateEvent(refreshEvents);
  
  return {
    addEventToCalendar,
    findAvailableTeam: (startTime: Date, endTime: Date) => 
      findAvailableTeam(startTime, endTime, events, resources),
    duplicateEvent
  };
};
