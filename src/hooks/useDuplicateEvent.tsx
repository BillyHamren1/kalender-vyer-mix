
import { useState } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { createCalendarEvent } from '@/services/eventService';
import { toast } from 'sonner';

export const useDuplicateEvent = (onEventDuplicated: () => void) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const duplicateEvent = async (eventId: string, targetResourceId: string): Promise<string> => {
    try {
      console.log('duplicateEvent called with:', eventId, targetResourceId);
      
      if (!selectedEvent) {
        console.error('No event selected for duplication');
        toast.error("No event selected for duplication");
        throw new Error('No event selected for duplication');
      }

      // Create the duplicated event
      const duplicatedEvent: Omit<CalendarEvent, 'id'> = {
        title: selectedEvent.title,
        start: selectedEvent.start,
        end: selectedEvent.end,
        resourceId: targetResourceId,
        eventType: selectedEvent.eventType,
        deliveryAddress: selectedEvent.deliveryAddress,
        bookingId: selectedEvent.bookingId,
        bookingNumber: selectedEvent.bookingNumber,
      };

      console.log('Creating duplicated event:', duplicatedEvent);

      // Save to database
      const savedEvent = await createCalendarEvent(duplicatedEvent);
      
      if (savedEvent) {
        toast.success('Event duplicated successfully');
        onEventDuplicated();
        setIsDialogOpen(false);
        setSelectedEvent(null);
        return savedEvent.id;
      }
      
      throw new Error('Failed to duplicate event');
    } catch (error) {
      console.error('Error duplicating event:', error);
      toast.error('Failed to duplicate event');
      throw error;
    }
  };

  const openDuplicateDialog = (event: CalendarEvent) => {
    console.log('Opening duplicate dialog for event:', event);
    setSelectedEvent(event);
    setIsDialogOpen(true);
  };

  return {
    isDialogOpen,
    setIsDialogOpen,
    selectedEvent,
    duplicateEvent,
    openDuplicateDialog,
    setSelectedEvent
  };
};
