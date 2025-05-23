
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';

interface CalendarEventHandlersProps {
  events: CalendarEvent[];
  resources: Resource[];
  handleEventChange: (info: any) => void;
  handleEventClick: (info: any) => void;
}

export const getEventHandlers = (
  handleEventChange: (info: any) => void,
  handleEventClick: (info: any) => void
) => {
  // Custom handler for event drops that prevents changes to team-6 events
  const handleEventDrop = (info: any) => {
    const isTeam6Event = info.event.getResources()[0]?.id === 'team-6';
    
    // If it's a team-6 event, revert the drop operation
    if (isTeam6Event) {
      info.revert();
      return;
    }
    
    // Otherwise, let the regular handler process it
    handleEventChange(info);
  };

  return {
    handleEventDrop,
    handleEventChange,
    handleEventClick
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
