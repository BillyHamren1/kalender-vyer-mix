import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format } from 'date-fns';

// SIMPLIFIED: Function to stack and arrange team-6 events with 2-hour durations and stacked from bottom up
const processTeam6Events = (events: CalendarEvent[]) => {
  // Get only events for team-6
  const team6Events = events.filter(event => event.resourceId === 'team-6');
  
  console.log(`CalendarEventProcessor: Processing ${team6Events.length} team-6 events`);
  
  // Sort events by booking ID to keep related bookings together
  // and then by start time within the same booking ID
  const sortedEvents = [...team6Events].sort((a, b) => {
    // First sort by booking ID
    if (a.bookingId && b.bookingId) {
      if (a.bookingId !== b.bookingId) {
        return a.bookingId.localeCompare(b.bookingId);
      }
    }
    
    // Then sort by original start time within same booking ID
    const aStartDate = new Date(a.start);
    const bStartDate = new Date(b.start);
    return aStartDate.getTime() - bStartDate.getTime();
  });
  
  // Define start positions (hours from midnight) ordered from BOTTOM TO TOP
  // This creates a stacked appearance from the bottom of the day upward
  const startPositions = [20, 17, 14, 11, 8, 5]; // Reversed order to stack from bottom up
  
  // Set fixed time slots for each event, using 2-hour slots
  return sortedEvents.map((event, index) => {
    // Preserve the original event data
    const originalStart = event.start;
    const originalEnd = event.end;

    // Calculate which start time to use - from the bottom up
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
    
    console.log(`CalendarEventProcessor: Team-6 event ${event.id} positioned at slot ${position} (${startHour}:00)`);
    
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
        bookingNumber: event.bookingNumber || event.bookingId || 'No ID', // Store booking number
        deliveryAddress: deliveryAddress // Store delivery address from event or use a default
      }
    };
  });
};

export const processEvents = (events: CalendarEvent[], resources: Resource[]) => {
  // Log events for debugging
  console.log(`CalendarEventProcessor: Processing ${events.length} events for calendar display`);
  
  // IMPORTANT: Create a Set to track processed event IDs to prevent duplicates
  const processedEventIds = new Set<string>();
  
  // Ensure all events have valid resources and deduplicate
  const uniqueEventsWithValidResources = events.filter(event => {
    // Skip if we've already processed this event
    if (processedEventIds.has(event.id)) {
      console.log(`CalendarEventProcessor: Skipping duplicate event ${event.id}`);
      return false;
    }
    
    processedEventIds.add(event.id);
    return true;
  }).map(event => {
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

  console.log(`CalendarEventProcessor: After deduplication: ${uniqueEventsWithValidResources.length} unique events`);

  // First process regular events (non-team-6)
  const regularEvents = uniqueEventsWithValidResources
    .filter(event => event.resourceId !== 'team-6')
    .map(event => {
      // Log event type for debugging
      console.log(`CalendarEventProcessor: Processing regular event ${event.id}, type: ${event.eventType}`);
      
      const backgroundColor = getEventColor(event.eventType);
      
      // Get delivery address from booking if available
      const deliveryAddress = event.deliveryAddress || 'No address provided';
      
      return {
        ...event,
        backgroundColor: backgroundColor,
        borderColor: backgroundColor,
        textColor: '#000000e6', // Black text for all events
        classNames: [`event-${event.eventType || 'default'}`],
        extendedProps: {
          ...event,
          dataEventType: event.eventType, // Add as data attribute
          deliveryAddress: deliveryAddress, // Ensure deliveryAddress is available
          bookingNumber: event.bookingNumber || event.bookingId || 'No ID', // Ensure bookingNumber is available
          originalResourceId: event.resourceId // Store the original resource ID
        }
      };
    });
  
  // Then process and stack team-6 events
  const team6ProcessedEvents = processTeam6Events(uniqueEventsWithValidResources);
  
  // Convert team-6 events to FullCalendar format
  const team6Events = team6ProcessedEvents.map(event => {
    console.log(`CalendarEventProcessor: Processing team-6 event ${event.id}, type: ${event.eventType}`);
    
    const backgroundColor = getEventColor(event.eventType);
    
    return {
      ...event,
      backgroundColor: backgroundColor,
      borderColor: backgroundColor,
      textColor: '#000000e6',
      classNames: [`event-${event.eventType || 'default'}`, 'stacked-event'],
      extendedProps: {
        ...event.extendedProps,
        originalResourceId: event.resourceId // Store the original resource ID
      }
    };
  });
  
  // Combine both sets of events
  const processed = [...regularEvents, ...team6Events];
  
  console.log(`CalendarEventProcessor: Final processed events: ${processed.length} (${regularEvents.length} regular + ${team6Events.length} team-6)`);
  return processed;
};

const CalendarEventProcessor: React.FC<{ events: CalendarEvent[], resources: Resource[] }> = ({ events, resources }) => {
  // This component doesn't render anything, it's just a utility
  return null;
};

export default CalendarEventProcessor;
