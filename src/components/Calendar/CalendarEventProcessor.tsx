
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
  const processed = eventsWithValidResources.map(event => {
    // Get proper color for the event type
    const eventType = event.eventType || 'event';
    const backgroundColor = event.color || getEventColor(eventType);
    const textColor = '#000000'; // Black text for all events
    
    return {
      ...event,
      backgroundColor, // Set background color directly on the event
      borderColor: backgroundColor,
      textColor,
      // Don't use classNames array as it may not work properly
      extendedProps: {
        ...event,
        eventType, // Ensure eventType is passed through
        bookingId: event.bookingId,
        viewed: event.viewed,
        dataEventType: eventType // Add as data attribute
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
