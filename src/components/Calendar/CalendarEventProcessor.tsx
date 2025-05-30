
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('Processing events:', events.length);
  
  if (events.length === 0) {
    return [];
  }
  
  // Create a map of valid resource IDs for quick lookup
  const validResourceIds = new Set(resources.map(r => r.id));

  const processedEvents = events.map((event) => {
    // Ensure the event has a valid resource ID
    let resourceId = event.resourceId;
    if (!resourceId || !validResourceIds.has(resourceId)) {
      console.warn(`Event ${event.id} has invalid resource ID: ${resourceId}, assigning to first team`);
      resourceId = resources.length > 0 ? resources[0].id : 'team-1';
    }
    
    // Get event color based on event type
    const eventColor = getEventColor(event.eventType);
    
    // Create simple title from booking data
    let eventTitle = event.title;
    const bookingNumber = event.extendedProps?.bookingNumber || event.bookingNumber;
    const client = event.extendedProps?.client || event.client;
    
    if (bookingNumber && client) {
      eventTitle = `${bookingNumber}: ${client}`;
    } else if (client) {
      eventTitle = client;
    } else if (bookingNumber) {
      eventTitle = bookingNumber;
    }
    
    // CRITICAL: Pass times directly to FullCalendar without ANY processing
    const processedEvent = {
      ...event,
      title: eventTitle,
      // Pass database times directly - let FullCalendar handle everything
      start: event.start,
      end: event.end,
      resourceId,
      backgroundColor: eventColor,
      borderColor: eventColor,
      textColor: '#ffffff',
      classNames: [`event-${event.eventType || 'default'}`, 'calendar-event', 'fc-event-draggable'],
      // EXPLICITLY enable ALL editing capabilities for EVERY event
      editable: true,
      startEditable: true,
      durationEditable: true,
      eventResizableFromStart: true,
      constraint: null, // Remove any constraints that might block dragging
      overlap: true, // Allow events to overlap during drag
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
    
    // Debug individual event processing
    console.log(`Processed event ${event.id}:`, {
      title: processedEvent.title,
      start: processedEvent.start,
      end: processedEvent.end,
      editable: processedEvent.editable,
      startEditable: processedEvent.startEditable,
      durationEditable: processedEvent.durationEditable
    });
    
    return processedEvent;
  });

  console.log('=== Event Processing Complete ===');
  console.log(`Total processed events: ${processedEvents.length}`);
  console.log('All events have editable=true:', processedEvents.every(e => e.editable === true));
  console.log('All events have startEditable=true:', processedEvents.every(e => e.startEditable === true));
  
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
