
import { useState } from 'react';
import { deleteCalendarEvent } from '@/services/eventService';
import { toast } from 'sonner';

export const useEventDeletion = (refreshEvents: () => Promise<void>) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteEvent = async (eventId: string, eventTitle: string) => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    
    try {
      await deleteCalendarEvent(eventId);
      
      toast.success('Event deleted successfully', {
        description: `"${eventTitle}" has been removed from the calendar`
      });
      
      // Refresh the calendar events
      await refreshEvents();
      
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event', {
        description: 'Please try again or contact support if the problem persists'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteEvent,
    isDeleting
  };
};
