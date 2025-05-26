
import { useState } from 'react';
import { CalendarEvent, generateEventId } from '@/components/Calendar/ResourceData';
import { createCalendarEvent } from '@/services/eventService';
import { toast } from 'sonner';

export const useDuplicateEvent = (onEventDuplicated: () => void) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const duplicateEvent = async (originalEvent: CalendarEvent, newDate: Date, newResourceId?: string) => {
    try {
      // Calculate the duration of the original event
      const originalStart = new Date(originalEvent.start);
      const originalEnd = new Date(originalEvent.end);
      const durationMs = originalEnd.getTime() - originalStart.getTime();

      // Create new start and end times
      const newStart = new Date(newDate);
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Create the duplicated event
      const duplicatedEvent: Omit<CalendarEvent, 'id'> = {
        title: originalEvent.title,
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        resourceId: newResourceId || originalEvent.resourceId,
        eventType: originalEvent.eventType,
        deliveryAddress: originalEvent.deliveryAddress,
        bookingId: originalEvent.bookingId,
        bookingNumber: originalEvent.bookingNumber,
      };

      // Save to database
      const savedEvent = await createCalendarEvent(duplicatedEvent);
      
      if (savedEvent) {
        toast.success('Event duplicated successfully');
        onEventDuplicated();
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error('Error duplicating event:', error);
      toast.error('Failed to duplicate event');
    }
  };

  const openDuplicateDialog = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsDialogOpen(true);
  };

  return {
    isDialogOpen,
    setIsDialogOpen,
    selectedEvent,
    duplicateEvent,
    openDuplicateDialog
  };
};
