import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

interface CalendarEventProcessorProps {
  events: CalendarEvent[];
  resources: Resource[];
}

// Function to stack and arrange team-6 events with 2-hour durations and 1-hour gaps
const processTeam6Events = (events: CalendarEvent[]) => {
  // Get only events for team-6
  const team6Events = events.filter(event => event.resourceId === 'team-6');
  
  // Sort events by booking ID to keep related bookings together
  const sortedEvents = [...team6Events].sort((a, b) => {
    if (a.bookingId && b.bookingId) {
      return a.bookingId.localeCompare(b.bookingId);
    }
    return a.title.localeCompare(b.title);
  });
  
  // Define standard start positions (hours from midnight) with 1-hour gaps
  const startPositions = [5, 8, 11, 14, 17, 20];
  
  // Map booking IDs to deduplicate events
  const processedBookingIds = new Set<string>();
  
  // Set fixed time slots for each event, using 2-hour slots
  return sortedEvents.map((event, index) => {
    // Preserve the original event data
    const originalStart = event.start;
    const originalEnd = event.end;

    // Calculate which start time to use
    const position = index % startPositions.length;
    
    // Create the current date at the specified hour
    const baseDate = new Date(event.start);
    baseDate.setHours(0, 0, 0, 0); // Reset to start of day
    
    // Set new start time (use the appropriate hour based on index)
    const startHour = startPositions[position];
    const start = new Date(baseDate);
    start.setHours(startHour, 0, 0, 0);
    
    // Set end time (2 hours later)
    const end = new Date(start);
    end.setHours(start.getHours() + 2);
    
    // Get the delivery address from the event's deliveryAddress or use default message
    const deliveryAddress = event.deliveryAddress || 'No address provided';
    
    return {
      ...event,
      start: start.toISOString(),
      end: end.toISOString(),
      extendedProps: {
        ...event,
        originalStart,
        originalEnd,
        isModifiedDisplay: true, // Flag to indicate this event's display time was modified
        clientName: event.title, // Store client name separately
        bookingId: event.bookingId || 'No ID', // Store booking ID
        deliveryAddress: deliveryAddress // Store delivery address from event or use a default
      }
    };
  });
};

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

  // First process regular events (non-team-6)
  const regularEvents = eventsWithValidResources.filter(event => event.resourceId !== 'team-6').map(event => {
    // Log event type for debugging
    console.log(`Processing regular event ${event.id}, type: ${event.eventType}`);
    
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
  
  // Then process and stack team-6 events
  const team6ProcessedEvents = processTeam6Events(eventsWithValidResources);
  
  // Convert team-6 events to FullCalendar format
  const team6Events = team6ProcessedEvents.map(event => {
    console.log(`Processing team-6 event ${event.id}, type: ${event.eventType}`);
    
    const backgroundColor = getEventColor(event.eventType);
    
    return {
      ...event,
      backgroundColor: backgroundColor,
      borderColor: backgroundColor,
      textColor: '#000000e6',
      classNames: [`event-${event.eventType || 'default'}`, 'stacked-event'],
      extendedProps: event.extendedProps
    };
  });
  
  // Combine both sets of events
  const processed = [...regularEvents, ...team6Events];
  
  console.log('Processed events with styles:', processed);
  return processed;
};

const CalendarEventProcessor: React.FC<CalendarEventProcessorProps> = ({ events, resources }) => {
  // This component doesn't render anything, it's just a utility
  return null;
};

export default CalendarEventProcessor;
