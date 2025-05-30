
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
      const event = info.event;

      const resourceId =
        event.getResources?.()?.[0]?.id ||
        event._def?.resourceIds?.[0] ||
        event.extendedProps?.resourceId ||
        null;

      if (!event.id || !event.start || !event.end || !resourceId) {
        console.warn('❌ Missing data during event update:', {
          id: event.id,
          start: event.start,
          end: event.end,
          resourceId,
          extendedProps: event.extendedProps,
        });
        toast("❌ Event update failed", {
          description: "Required event data is missing",
        });
        return;
      }

      const updateData = {
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        resourceId,
      };

      console.log("🔁 Updating calendar event:", updateData);

      await updateCalendarEvent(event.id, updateData);

      toast("✅ Event updated", {
        description: `Time updated to ${event.start.toLocaleTimeString()} - ${event.end.toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error("💥 Failed to update event:", error);
      toast("❌ Event update failed", {
        description: "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="timeGridDay"
      events={events}
      editable={true}
      eventStartEditable={true}
      eventDurationEditable={true}
      eventResizableFromStart={true}
      eventChange={handleEventChange}
      {...getCalendarOptions()}
    />
  );
};

export default DayCalendar;
