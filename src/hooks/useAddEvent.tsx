
import { useEffect } from 'react';
import { CalendarEvent, generateEventId, getEventColor, Resource } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { findAvailableTeam } from '@/utils/teamAvailability';

/**
 * Hook for adding events to the calendar
 */
export const useAddEvent = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>, 
  resources: Resource[]
) => {
  // Function to add new events to the calendar
  const addEventToCalendar = async (event: Omit<CalendarEvent, 'id'>) => {
    // If no resourceId is provided, find an available team
    let resourceId = event.resourceId;
    
    if (!resourceId || resourceId === 'auto') {
      const eventStartTime = new Date(event.start);
      const eventEndTime = new Date(event.end);
      resourceId = findAvailableTeam(eventStartTime, eventEndTime, events, resources);
    }
    
    const newEventId = generateEventId();
    
    const newEvent: CalendarEvent = {
      ...event,
      id: newEventId,
      color: getEventColor(event.eventType),
      resourceId: resourceId
    };
    
    // Add to local state first for immediate UI update
    setEvents(prevEvents => [...prevEvents, newEvent]);
    
    // Then add to Supabase
    try {
      const { error } = await supabase
        .from('calendar_events')
        .insert({
          id: newEventId,
          resource_id: resourceId,
          title: event.title,
          start_time: event.start,
          end_time: event.end,
          event_type: event.eventType,
          booking_id: event.bookingId
        });
      
      if (error) {
        throw error;
      }
      
      console.log("New event added to Supabase:", newEvent);
      toast.success("Event added successfully");
    } catch (error) {
      console.error("Error adding event to Supabase:", error);
      toast.error("Failed to add event to database");
    }
    
    return newEventId;
  };

  // Expose the add event function to window for BookingDetail.tsx to use
  useEffect(() => {
    // @ts-ignore
    window.addEventToCalendar = addEventToCalendar;
    
    return () => {
      // @ts-ignore
      delete window.addEventToCalendar;
    };
  }, [events, resources]);
  
  return {
    addEventToCalendar
  };
};
