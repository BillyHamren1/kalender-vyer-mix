
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';

interface CalendarEventHandlersProps {
  events: CalendarEvent[];
  resources: Resource[];
  handleEventChange: (info: any) => void;
  handleEventClick: (info: any) => void;
  handleEventReceive?: (info: any) => void;
}

export const getEventHandlers = (
  handleEventChange: (info: any) => void,
  handleEventClick: (info: any) => void,
  handleEventReceive?: (info: any) => void
) => {
  // Simple event drop handler - let FullCalendar handle the time changes
  const handleEventDrop = (info: any) => {
    console.log('Event dropped:', info.event.id);
    handleEventChange(info);
  };

  // Simple event resize handler - let FullCalendar handle the time changes
  const handleEventResize = (info: any) => {
    console.log('Event resized:', info.event.id);
    handleEventChange(info);
  };

  return {
    handleEventDrop,
    handleEventResize,
    handleEventChange,
    handleEventClick,
    handleEventReceive
  };
};

export const getCalendarTimeFormatting = () => {
  return {
    eventTimeFormat: {
      hour: '2-digit' as const,
      minute: '2-digit' as const,
      meridiem: false,
      hour12: false,
      omitZeroMinute: false
    }
  };
};

// This component doesn't render anything, it's just a utility
const CalendarEventHandlers: React.FC<CalendarEventHandlersProps> = () => null;

export default CalendarEventHandlers;
