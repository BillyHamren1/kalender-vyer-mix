
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { Resource, generateEventId } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { findAvailableTeam } from '@/utils/teamAvailability';

/**
 * Hook for duplicating events to other teams
 */
export const useDuplicateEvent = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>, 
  resources: Resource[]
) => {
  /**
   * Duplicates an existing event to another team
   * @param eventId The ID of the event to duplicate
   * @param targetResourceId The target team ID (optional)
   * @returns The ID of the newly created event or null if duplication failed
   */
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
        newResourceId = findAvailableTeam(eventStartTime, eventEndTime, events, resources);
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
  
  return {
    duplicateEvent
  };
};
