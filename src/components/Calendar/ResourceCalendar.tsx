
import React from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from '../Calendar/ResourceData';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
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

  const handleEventChange = async (info: any) => {
    try {
      const resourceId = info.event.getResources()[0]?.id || info.event._def.resourceIds[0];
      
      // Update the event in the database
      if (info.event.id) {
        await updateCalendarEvent(info.event.id, {
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        });
      }
      
      // Find the team name for the toast message
      const resourceName = resources.find(r => r.id === resourceId)?.title || resourceId;
      
      toast(`Event flyttat`, {
        description: `Eventet har flyttats till ${resourceName} vid ${info.event.start.toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  // Handle navigation to booking details when an event is clicked
  const handleEventClick = (info: any) => {
    const bookingId = info.event.extendedProps.bookingId;
    if (bookingId) {
      // Save current date to session storage before navigating
      sessionStorage.setItem('calendarDate', currentDate.toISOString());
      sessionStorage.setItem('calendarView', info.view.type);
      
      // Navigate to booking details
      navigate(`/booking/${bookingId}`);
    } else {
      console.log('Event clicked:', info.event.title);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <p className="text-gray-500">Loading calendar...</p>
      </div>
    );
  }

  if (!isMounted) {
    return null;
  }

  return (
    <FullCalendar
      plugins={[resourceTimeGridPlugin, timeGridPlugin, interactionPlugin, dayGridPlugin]}
      initialView="resourceTimeGridDay"
      initialDate={currentDate}
      resources={resources}
      events={events}
      height="auto"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'resourceTimeGridDay,timeGridWeek,dayGridMonth'
      }}
      views={{
        resourceTimeGridDay: {
          type: 'resourceTimeGrid',
          duration: { days: 1 }
        },
        timeGridWeek: {
          type: 'timeGrid',
          duration: { weeks: 1 },
          dayMaxEventRows: false,
          eventDisplay: 'block',
          eventOverlap: false,
          eventShortHeight: 20,
          slotEventOverlap: false
        },
        dayGridMonth: {
          type: 'dayGrid',
          duration: { months: 1 },
          dayMaxEventRows: true,
          moreLinkClick: 'popover',
          fixedWeekCount: false,
          showNonCurrentDates: true,
          eventDisplay: 'auto'
        }
      }}
      slotDuration="00:30:00"
      allDaySlot={false}
      locale="sv"
      editable={true}
      droppable={true}
      eventDurationEditable={true}
      eventResourceEditable={true}
      eventContent={(args) => {
        // Get event type for proper color coding
        const eventType = args.event.extendedProps.eventType;
        const bookingNumber = args.event.extendedProps.bookingNumber || '';
        const customer = args.event.extendedProps.customer || '';
        
        // Different rendering for month view vs other views
        if (args.view.type === 'dayGridMonth') {
          return (
            <div className={`text-xs p-1 overflow-hidden text-ellipsis whitespace-nowrap ${eventType ? `event-${eventType.toLowerCase()}` : ''}`}>
              {bookingNumber && customer ? (
                <div className="font-bold">{bookingNumber}: {customer}</div>
              ) : (
                <div className="font-bold">{args.event.title}</div>
              )}
            </div>
          );
        }
        
        // Default rendering for other views
        return (
          <div className={`text-xs p-1 ${eventType ? `event-${eventType.toLowerCase()}` : ''}`}>
            {bookingNumber && customer ? (
              <div className="font-bold">{bookingNumber}: {customer}</div>
            ) : (
              <div className="font-bold">{args.event.title}</div>
            )}
            <div>{args.timeText}</div>
          </div>
        );
      }}
      eventClick={handleEventClick}
      eventResize={handleEventChange}
      eventDragStop={(info) => {
        console.log('Drag stopped:', info.event.title);
      }}
      eventDragStart={(info) => {
        console.log('Drag started:', info.event.title);
      }}
      eventDrop={handleEventChange}
      datesSet={onDateSet}
    />
  );
};

export default ResourceCalendar;
