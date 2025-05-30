
import { CalendarEvent, Resource, getEventColor } from './ResourceData';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('=== CalendarEventProcessor Debug ===');
  console.log(`Processing ${events.length} events with ${resources.length} resources`);
  console.log('RAW EVENTS RECEIVED:', events);
  console.log('AVAILABLE RESOURCES:', resources);
  
  if (events.length === 0) {
    console.error('❌ NO EVENTS TO PROCESS - This is the problem!');
    return [];
  }
  
  // Create a map of valid resource IDs for quick lookup
  const validResourceIds = new Set(resources.map(r => r.id));
  console.log('Valid resource IDs:', Array.from(validResourceIds));

  const processedEvents = events.map((event, index) => {
    console.log(`Processing event ${index + 1}/${events.length}: ${event.title} (${event.id})`);
    console.log(`  Original resourceId: ${event.resourceId}`);
    console.log(`  Resource ID valid: ${validResourceIds.has(event.resourceId)}`);
    console.log(`  Event start: ${event.start}`);
    console.log(`  Event end: ${event.end}`);
    
    // Ensure the event has a valid resource ID
    let resourceId = event.resourceId;
    
    // If no resourceId or invalid resourceId, assign to first available team
    if (!resourceId || !validResourceIds.has(resourceId)) {
      console.warn(`Event ${event.id} has invalid resource ID: ${resourceId}, assigning to first team`);
      resourceId = resources.length > 0 ? resources[0].id : 'team-1';
    }
    
    // Get event color based on event type
    const eventColor = getEventColor(event.eventType);
    
    // Create proper title from booking data - FIXED
    let eventTitle = event.title;
    if (event.extendedProps?.bookingNumber && event.extendedProps?.client) {
      eventTitle = `${event.extendedProps.bookingNumber}: ${event.extendedProps.client}`;
    } else if (event.extendedProps?.client) {
      eventTitle = event.extendedProps.client;
    } else if (event.extendedProps?.bookingId && event.title !== event.extendedProps.bookingId) {
      // Use the original title if it's not a UUID
      eventTitle = event.title;
    }
    
    const processedEvent = {
      ...event,
      title: eventTitle, // Use the properly formatted title
      resourceId,
      backgroundColor: eventColor,
      borderColor: eventColor,
      textColor: '#ffffff', // White text for better contrast
      classNames: [`event-${event.eventType || 'default'}`, 'calendar-event'],
      extendedProps: {
        ...event.extendedProps,
        originalResourceId: event.resourceId, // Keep track of original resource ID
        eventType: event.eventType,
        bookingId: event.bookingId,
        deliveryAddress: event.deliveryAddress,
        bookingNumber: event.bookingNumber,
        client: event.extendedProps?.client || event.client
      }
    };
    
    console.log(`  ✅ Processed event:`, processedEvent);
    
    return processedEvent;
  });

  console.log(`=== Processing Complete ===`);
  console.log(`Input events: ${events.length}`);
  console.log(`Output events: ${processedEvents.length}`);
  console.log('FINAL PROCESSED EVENTS FOR CALENDAR:', processedEvents);
  
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

