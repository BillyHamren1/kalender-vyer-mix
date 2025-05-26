
import { useState } from 'react';
import { CalendarEvent, Resource, generateEventId } from '@/components/Calendar/ResourceData';
import { createCalendarEvent } from '@/services/eventService';
import { toast } from 'sonner';

export const useAddEvent = (resources: Resource[], onEventAdded: () => void) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const addEventToCalendar = async (eventData: Omit<CalendarEvent, 'id'>): Promise<string> => {
    try {
      // Save to database
      const savedEvent = await createCalendarEvent(eventData);
      
      if (savedEvent) {
        toast.success('Event added successfully');
        onEventAdded();
        setIsDialogOpen(false);
        return savedEvent.id;
      }
      
      throw new Error('Failed to create event');
    } catch (error) {
      console.error('Error adding event:', error);
      toast.error('Failed to add event');
      throw error;
    }
  };

  return {
    isDialogOpen,
    setIsDialogOpen,
    addEventToCalendar
  };
};
