
import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

interface CalendarEventProcessorProps {
  events: CalendarEvent[];
  resources: Resource[];
}

export const processEvents = (events: CalendarEvent[], resources: Resource[]) => {
  // Log events for debugging
  console.log('Processing events for calendar display:', events);
  
  // Ensure we have events to process
  if (!events || events.length === 0) {
    console.log('No events to process');
    return [];
  }
  
  // Ensure all events have valid resources
  const eventsWithValidResources = events.map(event => {
    // Ensure we're working with a valid event object
    if (!event) {
      console.warn('Encountered undefined event during processing');
      return null;
    }
    
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
  }).filter(Boolean) as CalendarEvent[]; // Filter out any null events

  // Process events to add color based on event type
  const processed = eventsWithValidResources.map(event => {
    // Ensure the event has an eventType property
    const eventType = event.eventType || 'default';
    
    // Log event type for debugging
    console.log(`Processing event ${event.id}, type: ${eventType}`);
    
    const backgroundColor = getEventColor(event.eventType);
    
    return {
      ...event,
      backgroundColor: backgroundColor,
      borderColor: backgroundColor,
      textColor: '#000000e6', // Black text for all events
      classNames: [`event-${eventType}`],
      extendedProps: {
        ...event,
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
