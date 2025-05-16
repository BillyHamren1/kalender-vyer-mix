
import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

interface CalendarEventProcessorProps {
  events: CalendarEvent[];
  resources: Resource[];
}

export const processEvents = (events: CalendarEvent[], resources: Resource[]) => {
  // Log events for debugging
  console.log('Processing events for calendar display:', events);
  
  // Ensure all events have valid resources
  const eventsWithValidResources = events.map(event => {
    // Check if event's resourceId exists in resources
    const resourceExists = resources.length > 0 && resources.some(r => r.id === event.resourceId);
    
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
  const processed = eventsWithValidResources.map(event => {
    // Log event type for debugging
    console.log(`Processing event ${event.id}, type: ${event.eventType}`);
    
    const backgroundColor = getEventColor(event.eventType);
    
    return {
      ...event,
      backgroundColor: backgroundColor,
      borderColor: backgroundColor,
      textColor: '#000000e6', // Black text for all events
      classNames: [`event-${event.eventType || 'default'}`],
      extendedProps: {
        ...event,
        dataEventType: event.eventType // Add as data attribute
      }
    };
  });
  
  console.log('Processed events with styles:', processed);
  return processed;
};

const CalendarEventProcessor: React.FC<CalendarEventProcessorProps> = ({ events, resources }) => {
  // This component doesn't render anything, it's just a utility
  return null;
};

export default CalendarEventProcessor;
