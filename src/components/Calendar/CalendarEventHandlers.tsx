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
  // Custom handler for event drops that prevents changes to team-6 events
  const handleEventDrop = (info: any) => {
    const isTeam6Event = info.event.getResources?.()?.[0]?.id === 'team-6' || 
                         info.event._def?.resourceIds?.[0] === 'team-6';
    
    // If it's a team-6 event, revert the drop operation
    if (isTeam6Event) {
      info.revert();
      return;
    }
    
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
    
    // Otherwise, let the regular handler process it
    handleEventChange(info);
  };

  return {
    handleEventDrop,
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
