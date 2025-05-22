
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
  // Use our modular hooks
  const { addEventToCalendar } = useAddEvent(events, setEvents, resources);
  const { duplicateEvent } = useDuplicateEvent(events, setEvents, resources);
  
  return {
    addEventToCalendar,
    findAvailableTeam: (startTime: Date, endTime: Date) => 
      findAvailableTeam(startTime, endTime, events, resources),
    duplicateEvent
  };
};
