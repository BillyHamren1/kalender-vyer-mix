
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

    // Force all EVENT type events to be displayed in team-6 (Todays events)
    const eventType = event.extendedProps?.eventType || event.eventType || 'event';
    if (eventType === 'event') {
      targetResourceId = 'team-6';
      
      // Set EVENT events to 2.5 hours duration
      const startTime = new Date(event.start);
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 2, startTime.getMinutes() + 30); // 2.5 hours
      
      const processedEvent = {
        ...event,
        resourceId: targetResourceId,
        end: endTime.toISOString(),
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

      console.log(`Processed EVENT type event ${event.id}: moved to team-6 with 2.5hr duration`);
      return processedEvent;
    }

    // For non-EVENT types, process normally
    const processedEvent = {
      ...event,
      resourceId: targetResourceId,
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

    console.log(`Processed event ${event.id}:`, {
      title: event.title,
      bookingId: processedEvent.extendedProps.bookingId,
      resourceId: processedEvent.resourceId,
      eventType: eventType
    });

    return processedEvent;
  });
};
