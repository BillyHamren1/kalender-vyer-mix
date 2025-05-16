import React, { useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from '../Calendar/ResourceData';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';
import { useNavigate } from 'react-router-dom';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
}

const ResourceCalendar: React.FC<ResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet
}) => {
  const navigate = useNavigate();
  const calendarRef = React.useRef<any>(null);

  // Log events and resources for debugging
  useEffect(() => {
    console.log('ResourceCalendar received events:', events);
    console.log('ResourceCalendar received resources:', resources);
    
    // Check if there are events with resource IDs that don't match any resources
    const resourceIds = new Set(resources.map(r => r.id));
    const unmatchedEvents = events.filter(event => !resourceIds.has(event.resourceId));
    
    if (unmatchedEvents.length > 0) {
      console.warn('Events with unmatched resources:', unmatchedEvents);
    }
  }, [events, resources]);

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
      navigate(`/booking/${bookingId}`);
      console.log(`Navigating to /booking/${bookingId}`);
    } else {
      console.warn('No booking ID found for this event');
      toast.warning("Cannot open booking details", {
        description: "This event is not linked to a booking"
      });
    }
  };

  // Ensure all events have valid resources
  const eventsWithValidResources = events.map(event => {
    // Check if event's resourceId exists in resources
    const resourceExists = resources.some(r => r.id === event.resourceId);
    
    if (!resourceExists && resources.length > 0) {
      console.warn(`Event with ID ${event.id} has resourceId ${event.resourceId} that doesn't match any resource. Assigning to first available resource.`);
      // Assign to the first resource if the resourceId doesn't exist
      return {
        ...event,
        resourceId: resources[0].id
      };
    }
    
    return event;
  });

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[
        resourceTimeGridPlugin,
        timeGridPlugin,
        interactionPlugin,
        dayGridPlugin
      ]}
      schedulerLicenseKey="0134084325-fcs-1745193612"
      initialView="resourceTimeGridDay"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'resourceTimeGridDay,resourceTimeGridWeek,dayGridMonth'
      }}
      resources={resources}
      events={eventsWithValidResources}
      editable={true}
      droppable={true}
      selectable={true}
      eventDurationEditable={true}
      eventResizableFromStart={true}
      eventDrop={handleEventChange}
      eventResize={handleEventChange}
      eventClick={handleEventClick}
      datesSet={onDateSet}
      initialDate={currentDate}
      height="auto"
    />
  );
};

export default ResourceCalendar;
