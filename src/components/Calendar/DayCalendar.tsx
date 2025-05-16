
import React, { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent } from './ResourceData';

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

  return (
    <div className="day-calendar-container">
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
          // Ensure event type classes are applied correctly
          const eventType = arg.event.extendedProps.eventType || 'event';
          return [`event-${eventType}`];
        }}
        eventContent={(arg) => {
          // Optional: Custom event rendering
          return (
            <div>
              <div className="fc-event-time">{arg.timeText}</div>
              <div className="fc-event-title">{arg.event.title}</div>
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
