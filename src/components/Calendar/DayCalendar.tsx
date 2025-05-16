
import React, { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent } from './ResourceData';
import { toast } from 'sonner';

interface DayCalendarProps {
  events: CalendarEvent[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  onEventDrop?: (eventDropInfo: any) => void;
  onEventResize?: (eventResizeInfo: any) => void;
}

const DayCalendar: React.FC<DayCalendarProps> = ({
  events,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  onEventDrop,
  onEventResize
}) => {
  const calendarRef = useRef<FullCalendar>(null);

  if (isLoading && !isMounted) {
    return (
      <div className="calendar-loading">
        Loading calendar...
      </div>
    );
  }

  console.log('Rendering DayCalendar with events:', events);
  
  // Add helper to navigate to a date with events
  const navigateToTodayOrEventsDate = () => {
    if (calendarRef.current && events.length > 0) {
      // Get the date of the first event
      const firstEventDate = new Date(events[0].start);
      calendarRef.current.getApi().gotoDate(firstEventDate);
      toast.info(`Navigated to date with events: ${firstEventDate.toLocaleDateString()}`);
    }
  };

  return (
    <div className="day-calendar-container">
      {events.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-700">No events found for the selected date range.</p>
        </div>
      )}
      
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
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
        weekends={true}
        initialDate={currentDate}
        datesSet={onDateSet}
        eventDrop={onEventDrop}
        eventResize={onEventResize}
        height="auto"
        allDaySlot={true}
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        eventClassNames={(arg) => {
          // Log event details for debugging
          console.log('Event in calendar:', arg.event.title, arg.event);
          
          // Ensure event type classes are applied correctly
          const eventType = arg.event.extendedProps?.eventType || 'event';
          return [`event-${eventType}`];
        }}
        eventContent={(arg) => {
          // Optional: Custom event rendering
          return (
            <div>
              <div className="fc-event-time">{arg.timeText}</div>
              <div className="fc-event-title">{arg.event.title}</div>
              <div className="fc-event-resource text-xs italic">
                {arg.event.getResources?.()?.[0]?.title || arg.event.extendedProps?.resourceId || 'No resource'}
              </div>
            </div>
          );
        }}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
          hour12: false
        }}
      />
    </div>
  );
};

export default DayCalendar;
