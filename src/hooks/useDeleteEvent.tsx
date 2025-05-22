
import { useState } from 'react';
import { deleteCalendarEvent } from '@/services/calendarService';
import { toast } from 'sonner';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

export const useDeleteEvent = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
  onSuccess?: () => Promise<void>
) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteEvent = async (eventId: string): Promise<boolean> => {
    if (!eventId) {
      toast.error('No event ID provided for deletion');
      return false;
    }

    setIsDeleting(true);
    try {
      // First update the UI state for immediate feedback
      setEvents(currentEvents => currentEvents.filter(event => event.id !== eventId));
      
      // Then delete from the database
      await deleteCalendarEvent(eventId);
      
      toast.success('Event deleted successfully');
      
      // Call the optional onSuccess callback (e.g., to refresh events)
      if (onSuccess) {
        await onSuccess();
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event. Please try again.');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteEvent,
    isDeleting
  };
};
