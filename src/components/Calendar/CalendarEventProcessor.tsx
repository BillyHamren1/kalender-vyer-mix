
import { CalendarEvent, Resource } from './ResourceData';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('Processing events:', events.length);
  
  return events.map(event => {
    // Ensure the event has a valid resource
    let targetResourceId = event.resourceId;
    const validResource = resources.find(r => r.id === event.resourceId);
    
    if (!validResource) {
      console.warn(`Event ${event.id} has invalid resourceId: ${event.resourceId}`);
      targetResourceId = resources[0]?.id || 'team-1'; // Fallback to first resource
    }

    // Get the actual event type - don't default to 'event' for everything
    const eventType = event.extendedProps?.eventType || event.eventType;
    
    // Only force EVENT type events to team-6 (Todays events), leave other types in their assigned teams
    if (eventType === 'event') {
      targetResourceId = 'team-6';
      
      // Set EVENT events to 2.5 hours duration (150 minutes)
      const startTime = new Date(event.start);
      const endTime = new Date(startTime);
      endTime.setTime(startTime.getTime() + (2.5 * 60 * 60 * 1000)); // 2.5 hours in milliseconds
      
      const processedEvent = {
        ...event,
        resourceId: targetResourceId,
        end: endTime.toISOString(),
        // Keep all properties that make events draggable
        editable: true,
        startEditable: true,
        durationEditable: true,
        resourceEditable: true,
        extendedProps: {
          ...event.extendedProps,
          bookingId: event.extendedProps?.bookingId || event.bookingId,
          booking_id: event.extendedProps?.booking_id || event.bookingId,
          resourceId: targetResourceId,
          deliveryAddress: event.extendedProps?.deliveryAddress,
          bookingNumber: event.extendedProps?.bookingNumber,
          eventType: eventType,
          originalResourceId: event.resourceId // Keep track of original assignment
        }
      };

      console.log(`Processed EVENT type event ${event.id}: moved to team-6 with 2.5hr duration and draggable`);
      return processedEvent;
    }

    // For non-EVENT types, process normally and ensure they remain draggable
    const processedEvent = {
      ...event,
      resourceId: targetResourceId,
      // Ensure all events are draggable
      editable: true,
      startEditable: true,
      durationEditable: true,
      resourceEditable: true,
      extendedProps: {
        ...event.extendedProps,
        bookingId: event.extendedProps?.bookingId || event.bookingId,
        booking_id: event.extendedProps?.booking_id || event.bookingId,
        resourceId: targetResourceId,
        deliveryAddress: event.extendedProps?.deliveryAddress,
        bookingNumber: event.extendedProps?.bookingNumber,
        eventType: eventType
      }
    };

    console.log(`Processed ${eventType || 'unknown'} type event ${event.id}:`, {
      title: event.title,
      bookingId: processedEvent.extendedProps.bookingId,
      resourceId: processedEvent.resourceId,
      eventType: eventType,
      editable: processedEvent.editable
    });

    return processedEvent;
  });
};
