

import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';

interface CalendarEventHandlersProps {
  events: CalendarEvent[];
  resources: Resource[];
  handleEventChange: (info: any) => void;
  handleEventClick: (info: any) => void;
  handleEventReceive?: (info: any) => void; // Add new handler type
}

export const getEventHandlers = (
  handleEventChange: (info: any) => void,
  handleEventClick: (info: any) => void,
  handleEventReceive?: (info: any) => void
) => {
  // Custom handler for event drops - REMOVED the team-6 blocking logic
  const handleEventDrop = (info: any) => {
    // Log detailed information about the drop operation
    console.log('Event drop detected:', {
      eventId: info.event.id,
      oldResource: info.oldResource?.id,
      newResource: info.newResource?.id,
      oldStart: info.oldEvent.start?.toISOString(),
      newStart: info.event.start?.toISOString(),
      oldEnd: info.oldEvent.end?.toISOString(),
      newEnd: info.event.end?.toISOString(),
      delta: info.delta,
    });
    
    // Allow all events to be dropped, including team-6 events
    handleEventChange(info);
  };

  // Custom handler for event resizing (time changes)
  const handleEventResize = (info: any) => {
    console.log('Event resize detected:', {
      eventId: info.event.id,
      resourceId: info.event.getResources?.()?.[0]?.id,
      oldStart: info.oldEvent.start?.toISOString(),
      newStart: info.event.start?.toISOString(),
      oldEnd: info.oldEvent.end?.toISOString(),
      newEnd: info.event.end?.toISOString(),
      delta: info.delta,
    });
    
    // Allow all events to be resized, including team-6 events
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
      hour: '2-digit' as '2-digit', // Use literal type assertion
      minute: '2-digit' as '2-digit', // Use literal type assertion
      meridiem: false,
      hour12: false,
      omitZeroMinute: false // Always show minutes even if 00
    }
  };
};

// This component doesn't render anything, it's just a utility
const CalendarEventHandlers: React.FC<CalendarEventHandlersProps> = () => null;

export default CalendarEventHandlers;
