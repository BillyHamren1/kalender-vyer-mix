import { useEffect } from 'react';
import { CalendarEvent, generateEventId, getEventColor } from '@/components/Calendar/ResourceData';
import { Resource } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useEventActions = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>, 
  resources: Resource[]
) => {
  // Function to find the first available team for a new event
  const findAvailableTeam = (eventStartTime: Date, eventEndTime: Date): string => {
    const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
    if (teamResources.length === 0) return 'team-1'; // Default if no teams exist
    
    // For simplicity, prioritize teams in order (team-1, team-2, etc.)
    // This ensures events are placed in order, starting from team-1
    
    // Find all teams without events at the given time slot
    const busyTeams = new Set<string>();
    
    events.forEach(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Check if the event overlaps with the new time slot
      if (
        (eventStartTime <= eventEnd && eventEndTime >= eventStart) &&
        event.resourceId.startsWith('team-')
      ) {
        busyTeams.add(event.resourceId);
      }
    });
    
    // Find first available team in order
    const sortedTeams = teamResources.sort((a, b) => {
      // Extract team numbers for proper numeric sorting
      const numA = parseInt(a.id.split('-')[1]);
      const numB = parseInt(b.id.split('-')[1]);
      return numA - numB;
    });
    
    // Find first available team
    for (const team of sortedTeams) {
      if (!busyTeams.has(team.id)) {
        return team.id;
      }
    }
    
    // If all teams are busy, return the first team
    return sortedTeams[0].id;
  };
  
  // Function to add new events to the calendar
  const addEventToCalendar = async (event: Omit<CalendarEvent, 'id'>) => {
    // If no resourceId is provided, find an available team
    let resourceId = event.resourceId;
    
    if (!resourceId || resourceId === 'auto') {
      const eventStartTime = new Date(event.start);
      const eventEndTime = new Date(event.end);
      resourceId = findAvailableTeam(eventStartTime, eventEndTime);
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
  
  // New function to duplicate an existing event to another team
  const duplicateEvent = async (eventId: string, targetResourceId?: string) => {
    try {
      // Find the event to duplicate
      const eventToDuplicate = events.find(event => event.id === eventId);
      
      if (!eventToDuplicate) {
        throw new Error('Event not found');
      }
      
      // Determine target resource ID (team)
      let newResourceId = targetResourceId;
      
      if (!newResourceId || newResourceId === 'auto') {
        const eventStartTime = new Date(eventToDuplicate.start);
        const eventEndTime = new Date(eventToDuplicate.end);
        newResourceId = findAvailableTeam(eventStartTime, eventEndTime);
      }
      
      // Don't duplicate to the same team
      if (newResourceId === eventToDuplicate.resourceId) {
        toast.warning("Cannot duplicate to the same team", {
          description: "Please select a different team for the duplicated event"
        });
        return null;
      }
      
      // Create a new event based on the original one
      const newEventId = generateEventId();
      
      const newEvent: CalendarEvent = {
        ...eventToDuplicate,
        id: newEventId,
        resourceId: newResourceId
      };
      
      // Add to local state first for immediate UI update
      setEvents(prevEvents => [...prevEvents, newEvent]);
      
      // Then add to Supabase
      try {
        const { error } = await supabase
          .from('calendar_events')
          .insert({
            id: newEventId,
            resource_id: newResourceId,
            title: eventToDuplicate.title,
            start_time: eventToDuplicate.start,
            end_time: eventToDuplicate.end,
            event_type: eventToDuplicate.eventType,
            booking_id: eventToDuplicate.bookingId
          });
        
        if (error) {
          throw error;
        }
        
        console.log("Event duplicated to team:", newResourceId);
        toast.success("Event duplicated successfully", {
          description: `Event was duplicated to ${resources.find(r => r.id === newResourceId)?.title || newResourceId}`
        });
        
        return newEventId;
      } catch (error) {
        console.error("Error duplicating event to Supabase:", error);
        toast.error("Failed to duplicate event");
        
        // Remove from local state if database operation failed
        setEvents(prevEvents => prevEvents.filter(event => event.id !== newEventId));
        return null;
      }
    } catch (error) {
      console.error("Error in duplicateEvent:", error);
      toast.error("Failed to duplicate event");
      return null;
    }
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
    addEventToCalendar,
    findAvailableTeam,
    duplicateEvent
  };
};
