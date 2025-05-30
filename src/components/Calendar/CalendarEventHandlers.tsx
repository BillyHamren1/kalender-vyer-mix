
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
  // FIXED: Enhanced handler for event drops with proper logging
  const handleEventDrop = (info: any) => {
    // Log detailed information about the drop operation
    console.log('✅ Event drop detected and ENABLED:', {
      eventId: info.event.id,
      oldResource: info.oldResource?.id,
      newResource: info.newResource?.id,
      oldStart: info.oldEvent.start?.toISOString(),
      newStart: info.event.start?.toISOString(),
      oldEnd: info.oldEvent.end?.toISOString(),
      newEnd: info.event.end?.toISOString(),
      delta: info.delta,
    });
    
    // FIXED: Allow all events to be dropped - no restrictions
    handleEventChange(info);
  };

  // FIXED: Enhanced handler for event resizing with proper logging
  const handleEventResize = (info: any) => {
    console.log('✅ Event resize detected and ENABLED:', {
      eventId: info.event.id,
      resourceId: info.event.getResources?.()?.[0]?.id,
      oldStart: info.oldEvent.start?.toISOString(),
      newStart: info.event.start?.toISOString(),
      oldEnd: info.oldEvent.end?.toISOString(),
      newEnd: info.event.end?.toISOString(),
      delta: info.delta,
    });
    
    // FIXED: Allow all events to be resized - no restrictions
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
