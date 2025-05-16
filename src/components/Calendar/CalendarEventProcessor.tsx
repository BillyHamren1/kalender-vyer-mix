
import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

interface CalendarEventProcessorProps {
  events: CalendarEvent[];
  resources: Resource[];
}

export const processEvents = (events: CalendarEvent[], resources: Resource[]) => {
  // Ensure all events have valid resources
  const eventsWithValidResources = events.map(event => {
    // Check if event's resourceId exists in resources
    const resourceExists = resources.some(r => r.id === event.resourceId);
    
    if (!resourceExists && resources.length > 0) {
      console.warn(`Event with ID ${event.id} has resourceId ${event.resourceId} that doesn't match any resource. Assigning to first available resource.`);
      // Assign to the first resource if the resourceId doesn't exist
      return {
        ...event,
        resourceId: resources[0].id
      };
    }
    
    return event;
  });

  // Process events to add color based on event type
  return eventsWithValidResources.map(event => {
    return {
      ...event,
      backgroundColor: getEventColor(event.eventType),
      borderColor: getEventColor(event.eventType),
      textColor: '#000000e6', // Black text for all events
      classNames: [`event-${event.eventType || 'default'}`],
      extendedProps: {
        ...event,
        dataEventType: event.eventType // Add as data attribute
      }
    };
  });
};

const CalendarEventProcessor: React.FC<CalendarEventProcessorProps> = ({ events, resources }) => {
  // This component doesn't render anything, it's just a utility
  return null;
};

export default CalendarEventProcessor;
