
import { useState, useContext } from 'react';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';
import { Resource } from '@/components/Calendar/ResourceData';
import { useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';

export const useCalendarEventHandlers = (resources: Resource[]) => {
  const navigate = useNavigate();
  const { setLastViewedDate, setLastPath } = useContext(CalendarContext);

  const handleEventChange = async (info: any) => {
    try {
      const resourceId = info.event.getResources()[0]?.id || info.event._def.resourceIds[0];

      if (info.event.id) {
        await updateCalendarEvent(info.event.id, {
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        });
      }

      const resourceName = resources.find(r => r.id === resourceId)?.title || resourceId;

      toast("Event flyttat", {
        description: `Eventet har flyttats till ${resourceName} vid ${info.event.start.toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  const handleEventClick = (info: any) => {
    const bookingId = info.event.extendedProps.bookingId;
    console.log('Event clicked:', info.event);
    console.log('Booking ID:', bookingId);
    
    if (bookingId) {
      // Save current date and path before navigating
      setLastViewedDate(info.event.start);
      setLastPath(window.location.pathname);
      
      navigate(`/booking/${bookingId}`);
      console.log(`Navigating to /booking/${bookingId}`);
    } else {
      console.warn('No booking ID found for this event');
      toast.warning("Cannot open booking details", {
        description: "This event is not linked to a booking"
      });
    }
  };

  return {
    handleEventChange,
    handleEventClick
  };
};
