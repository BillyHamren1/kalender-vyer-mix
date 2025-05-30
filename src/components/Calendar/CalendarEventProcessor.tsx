
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { parseISO, isValid } from 'date-fns';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('Processing events:', events.length);
  
  if (events.length === 0) {
    return [];
  }
  
  // Create a map of valid resource IDs for quick lookup
  const validResourceIds = new Set(resources.map(r => r.id));

  const processedEvents = events.map((event) => {
    // Parse times simply - no modifications
    let startTime: Date;
    let endTime: Date;
    
    try {
      startTime = typeof event.start === 'string' ? parseISO(event.start) : new Date(event.start);
      endTime = typeof event.end === 'string' ? parseISO(event.end) : new Date(event.end);
      
      if (!isValid(startTime) || !isValid(endTime)) {
        throw new Error('Invalid date parsing');
      }
    } catch (error) {
      console.error('Error parsing event times:', error);
      // Fallback to current time + 1 hour if parsing fails
      startTime = new Date();
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }
    
    // Ensure the event has a valid resource ID
    let resourceId = event.resourceId;
    if (!resourceId || !validResourceIds.has(resourceId)) {
      console.warn(`Event ${event.id} has invalid resource ID: ${resourceId}, assigning to first team`);
      resourceId = resources.length > 0 ? resources[0].id : 'team-1';
    }
    
    // Get event color based on event type
    const eventColor = getEventColor(event.eventType);
    
    // Create proper title from booking data
    let eventTitle = event.title;
    const bookingNumber = event.extendedProps?.bookingNumber || event.bookingNumber;
    const client = event.extendedProps?.client || event.client;
    
    // Simple title logic
    if (bookingNumber && client) {
      eventTitle = `${bookingNumber}: ${client}`;
    } else if (client && (event.title.length > 30 || event.title.includes('-'))) {
      eventTitle = client;
    } else if (bookingNumber && (event.title.length > 30 || event.title.includes('-'))) {
      eventTitle = bookingNumber;
    } else if (event.title && event.title.length <= 30 && !event.title.includes('-')) {
      eventTitle = event.title;
    } else {
      eventTitle = `Event ${event.id.substring(0, 8)}`;
    }
    
    const processedEvent = {
      ...event,
      title: eventTitle,
      // Use the parsed times as ISO strings - let FullCalendar handle display
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      resourceId,
      backgroundColor: eventColor,
      borderColor: eventColor,
      textColor: '#ffffff',
      classNames: [`event-${event.eventType || 'default'}`, 'calendar-event'],
      // Enable editing
      editable: true,
      startEditable: true,
      durationEditable: true,
      extendedProps: {
        ...event.extendedProps,
        originalResourceId: event.resourceId,
        eventType: event.eventType,
        bookingId: event.bookingId,
        deliveryAddress: event.deliveryAddress,
        bookingNumber: bookingNumber,
        client: client
      }
    };
    
    return processedEvent;
  });

  console.log('Processed events:', processedEvents.length);
  return processedEvents;
};

export const validateEventResources = (events: CalendarEvent[], resources: Resource[]): string[] => {
  const validResourceIds = new Set(resources.map(r => r.id));
  const invalidEvents: string[] = [];
  
  events.forEach(event => {
    if (!event.resourceId || !validResourceIds.has(event.resourceId)) {
      invalidEvents.push(`Event "${event.title}" (${event.id}) has invalid resource ID: ${event.resourceId}`);
    }
  });
  
  return invalidEvents;
};
