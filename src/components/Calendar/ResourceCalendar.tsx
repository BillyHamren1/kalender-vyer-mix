
import React from 'react';
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
    if (bookingId) {
      navigate(`/bookings/${bookingId}`);
    }
  };

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
      events={events}
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
