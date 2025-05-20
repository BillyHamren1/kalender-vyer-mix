import React, { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent } from './ResourceData';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { updateCalendarEvent } from '@/services/calendarService';
import { getCalendarOptions } from './CalendarConfig';

interface DayCalendarProps {
  events: CalendarEvent[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
}

const DayCalendar: React.FC<DayCalendarProps> = ({
  events,
  isLoading,
  isMounted,
  currentDate,
  onDateSet
}) => {
  const navigate = useNavigate();
  const calendarRef = useRef<FullCalendar>(null);

  if (isLoading && !isMounted) {
    return (
      <div className="calendar-loading">
        Loading calendar...
      </div>
    );
  }

  console.log('Rendering DayCalendar with events:', events);
  
  const handleEventChange = async (info: any) => {
    try {
      // Get the resource ID in the correct format
      const resourceId = info.event.getResources?.()?.[0]?.id || 
                        info.event._def?.resourceIds?.[0] || 
                        info.event.extendedProps?.resourceId;

      console.log('Event change detected:', info);
      console.log('Resource ID for updated event:', resourceId);

      if (info.event.id) {
        // Prepare update data
        const updateData = {
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        };
        
        console.log('Updating event with data:', updateData);
        
        await updateCalendarEvent(info.event.id, updateData);

        toast("Event updated", {
          description: `Event time updated to ${info.event.start.toLocaleTimeString()}`,
        });
      }
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
  
  // Function to navigate to a date with events
  const navigateToTodayOrEventsDate = () => {
    if (calendarRef.current && events.length > 0) {
      // Get the date of the first event
      const firstEventDate = new Date(events[0].start);
      calendarRef.current.getApi().gotoDate(firstEventDate);
      toast.info(`Navigated to date with events: ${firstEventDate.toLocaleDateString()}`);
    } else {
      calendarRef.current?.getApi().today();
      toast.info('Navigated to today');
    }
  };

  return (
    <div className="day-calendar-container">
      <div className="mb-4">
        <button 
          onClick={navigateToTodayOrEventsDate}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm"
        >
          Find Events
        </button>
      </div>
      
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridDay"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
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
        allDaySlot={true}
        slotDuration="01:00:00" // One hour per slot
        slotLabelInterval="01:00:00"
        slotMinTime="00:00:00" // Start from midnight
        slotMaxTime="24:00:00" // Show all hours
        scrollTime="00:00:00" // Initial scroll position at midnight
        slotLabelFormat={{
          hour: '2-digit',
          minute: '2-digit',
          hour12: false, // Use 24-hour format
          omitZeroMinute: false // Always show minutes even if 00
        }}
        eventClassNames={(arg) => {
          const eventType = arg.event.extendedProps?.eventType || 'event';
          return [`event-${eventType}`];
        }}
        eventContent={(arg) => {
          // Get the event type to determine styling
          const eventType = arg.event.extendedProps?.eventType || 'event';
          
          // For event type 'event' (yellow events), include delivery address 
          if (eventType === 'event') {
            const deliveryAddress = arg.event.extendedProps?.deliveryAddress || 'No address provided';
            const bookingId = arg.event.extendedProps?.bookingId || '';
            
            return (
              <div>
                <div className="fc-event-time">{arg.timeText}</div>
                <div className="fc-event-title">{arg.event.title}</div>
                {bookingId && <div className="fc-event-id text-xs">ID: {bookingId}</div>}
                <div className="fc-event-address text-xs italic">{deliveryAddress}</div>
              </div>
            );
          }
          
          // Default rendering for other event types
          return (
            <div>
              <div className="fc-event-time">{arg.timeText}</div>
              <div className="fc-event-title">{arg.event.title}</div>
              {arg.event.extendedProps?.resourceId && (
                <div className="fc-event-resource text-xs italic">
                  {arg.event.extendedProps.resourceId}
                </div>
              )}
            </div>
          );
        }}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false, // Don't show AM/PM
          hour12: false    // Use 24-hour format
        }}
      />
    </div>
  );
};

export default DayCalendar;
