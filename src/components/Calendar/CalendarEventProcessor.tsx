
import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format } from 'date-fns';

// Function to stack and arrange team-6 events with 2-hour durations and stacked from bottom up
const processTeam6Events = (events: CalendarEvent[]) => {
  // Get only events for team-6
  const team6Events = events.filter(event => event.resourceId === 'team-6');
  
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

// Function to stack events for a specific team that have overlapping times
const stackTeamEvents = (teamEvents: CalendarEvent[]) => {
  if (teamEvents.length <= 1) return teamEvents;
  
  // Sort events by start time
  const sortedEvents = [...teamEvents].sort((a, b) => {
    const aStart = new Date(a.start).getTime();
    const bStart = new Date(b.start).getTime();
    return aStart - bStart;
  });
  
  const processedEvents: CalendarEvent[] = [];
  
  // Track events that overlap with each other
  const overlapGroups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [sortedEvents[0]];
  
  // Group overlapping events
  for (let i = 1; i < sortedEvents.length; i++) {
    const currentEvent = sortedEvents[i];
    const previousEvent = sortedEvents[i - 1];
    
    const currentStart = new Date(currentEvent.start);
    const previousEnd = new Date(previousEvent.end);
    
    // Check if events overlap
    if (currentStart < previousEnd) {
      // Events overlap, add to current group
      currentGroup.push(currentEvent);
    } else {
      // No overlap, finish current group and start a new one
      if (currentGroup.length > 0) {
        overlapGroups.push([...currentGroup]);
      }
      currentGroup = [currentEvent];
    }
  }
  
  // Add the last group
  if (currentGroup.length > 0) {
    overlapGroups.push(currentGroup);
  }
  
  // Process each group of overlapping events
  overlapGroups.forEach(group => {
    if (group.length === 1) {
      // Single event, just ensure it's 4 hours long
      const event = group[0];
      const start = new Date(event.start);
      const end = new Date(start);
      end.setHours(start.getHours() + 4); // Make event 4 hours long
      
      processedEvents.push({
        ...event,
        end: end.toISOString(),
        extendedProps: {
          ...event,
          originalStart: event.start,
          originalEnd: event.end,
          isModifiedDisplay: true
        }
      });
    } else {
      // Multiple overlapping events, stack them
      group.forEach((event, index) => {
        const baseStart = new Date(event.start);
        // Stagger start times by 30 minutes for each event in the group
        baseStart.setMinutes(baseStart.getMinutes() + (index * 30));
        
        const end = new Date(baseStart);
        end.setHours(baseStart.getHours() + 4); // Make each event 4 hours long
        
        processedEvents.push({
          ...event,
          start: baseStart.toISOString(),
          end: end.toISOString(),
          extendedProps: {
            ...event,
            originalStart: event.start,
            originalEnd: event.end,
            isModifiedDisplay: true
          }
        });
      });
    }
  });
  
  return processedEvents;
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

  // Group events by team for stacking within each team
  const eventsByTeam: Record<string, CalendarEvent[]> = {};
  
  // Initialize teams
  resources.forEach(resource => {
    if (resource.id !== 'team-6') { // Skip team-6 as it has special handling
      eventsByTeam[resource.id] = [];
    }
  });
  
  // Group events by team
  eventsWithValidResources
    .filter(event => event.resourceId !== 'team-6')
    .forEach(event => {
      if (eventsByTeam[event.resourceId]) {
        eventsByTeam[event.resourceId].push(event);
      }
    });
  
  // Process regular events (non-team-6) with stacking within each team
  let regularEvents: CalendarEvent[] = [];
  
  // Process each team's events
  Object.entries(eventsByTeam).forEach(([teamId, teamEvents]) => {
    const processedTeamEvents = stackTeamEvents(teamEvents);
    regularEvents = [...regularEvents, ...processedTeamEvents];
  });
  
  // Apply FullCalendar styling to regular events
  const styledRegularEvents = regularEvents.map(event => {
    // Log event type for debugging
    console.log(`Processing regular event ${event.id}, type: ${event.eventType}`);
    
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
        ...event.extendedProps || {},
        dataEventType: event.eventType, // Add as data attribute
        deliveryAddress: deliveryAddress, // Ensure deliveryAddress is available
        originalResourceId: event.resourceId // Store the original resource ID
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
      extendedProps: {
        ...event.extendedProps,
        originalResourceId: event.resourceId // Store the original resource ID
      }
    };
  });
  
  // Combine both sets of events
  const processed = [...styledRegularEvents, ...team6Events];
  
  console.log('Processed events with styles:', processed);
  return processed;
};

const CalendarEventProcessor: React.FC<{ events: CalendarEvent[], resources: Resource[] }> = ({ events, resources }) => {
  // This component doesn't render anything, it's just a utility
  return null;
};

export default CalendarEventProcessor;
