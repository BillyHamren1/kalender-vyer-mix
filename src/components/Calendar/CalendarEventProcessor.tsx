
import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

interface CalendarEventProcessorProps {
  events: CalendarEvent[];
  resources: Resource[];
}

export const processEvents = (events: CalendarEvent[], resources: Resource[]) => {
  // Log events for debugging
  console.log('Processing events for calendar display:', events?.length || 0);
  
  // Ensure we have events to process
  if (!events || events.length === 0) {
    console.log('No events to process');
    return [];
  }
  
  // Create a deep copy of the events to avoid mutation issues
  const eventsCopy = JSON.parse(JSON.stringify(events));
  
  // Process events to add color based on event type
  const processed = eventsCopy.map((event: CalendarEvent) => {
    if (!event) {
      console.warn('Encountered undefined event during processing');
      return null;
    }
    
    // Ensure the event has an eventType property, default to 'event' if missing
    const eventType = event.eventType || 'event';
    
    // Get background color based on event type
    const backgroundColor = getEventColor(event.eventType);
    
    // Make sure dates are proper ISO strings
    if (event.start && !(event.start instanceof Date) && typeof event.start === 'string') {
      // If it's not already an ISO string, ensure it is
      if (!event.start.includes('T')) {
        event.start = new Date(event.start).toISOString();
      }
    }
    
    if (event.end && !(event.end instanceof Date) && typeof event.end === 'string') {
      // If it's not already an ISO string, ensure it is
      if (!event.end.includes('T')) {
        event.end = new Date(event.end).toISOString();
      }
    }
    
    // Return processed event with styling
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
  }).filter(Boolean);
  
  console.log('Processed events with styles:', processed);
  return processed;
};

const CalendarEventProcessor: React.FC<CalendarEventProcessorProps> = ({ events, resources }) => {
  // This component doesn't render anything, it's just a utility
  return null;
};

export default CalendarEventProcessor;
