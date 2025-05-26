
import { useState } from 'react';
import { CalendarEvent, Resource, generateEventId } from '@/components/Calendar/ResourceData';
import { createCalendarEvent } from '@/services/eventService';
import { toast } from 'sonner';

export const useAddEvent = (resources: Resource[], onEventAdded: () => void) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const addEventToCalendar = async (eventData: {
    title: string;
    start: Date;
    end: Date;
    resourceId: string;
    eventType?: 'rig' | 'event' | 'rigDown';
    deliveryAddress?: string;
    bookingId?: string;
    bookingNumber?: string;
  }) => {
    try {
      // Create the event object
      const newEvent: Omit<CalendarEvent, 'id'> = {
        title: eventData.title,
        start: eventData.start.toISOString(),
        end: eventData.end.toISOString(),
        resourceId: eventData.resourceId,
        eventType: eventData.eventType || 'event',
        deliveryAddress: eventData.deliveryAddress,
        bookingId: eventData.bookingId,
        bookingNumber: eventData.bookingNumber,
      };

      // Save to database
      const savedEvent = await createCalendarEvent(newEvent);
      
      if (savedEvent) {
        toast.success('Event added successfully');
        onEventAdded();
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error('Error adding event:', error);
      toast.error('Failed to add event');
    }
  };

  return {
    isDialogOpen,
    setIsDialogOpen,
    addEventToCalendar
  };
};
