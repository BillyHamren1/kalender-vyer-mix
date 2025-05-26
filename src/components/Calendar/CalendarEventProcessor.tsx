
import { CalendarEvent, Resource } from './ResourceData';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('Processing events:', events.length);
  
  return events.map(event => {
    // Ensure the event has a valid resource
    const validResource = resources.find(r => r.id === event.resourceId);
    
    if (!validResource) {
      console.warn(`Event ${event.id} has invalid resourceId: ${event.resourceId}`);
      return {
        ...event,
        resourceId: resources[0]?.id || 'team-1' // Fallback to first resource
      };
    }

    // Ensure booking events have proper booking ID in extendedProps
    const processedEvent = {
      ...event,
      extendedProps: {
        ...event.extendedProps,
        bookingId: event.extendedProps?.bookingId || event.bookingId,
        booking_id: event.extendedProps?.booking_id || event.bookingId,
        resourceId: event.resourceId,
        deliveryAddress: event.extendedProps?.deliveryAddress,
        bookingNumber: event.extendedProps?.bookingNumber,
        eventType: event.extendedProps?.eventType || 'event'
      }
    };

    console.log(`Processed event ${event.id}:`, {
      title: event.title,
      bookingId: processedEvent.extendedProps.bookingId,
      resourceId: processedEvent.resourceId
    });

    return processedEvent;
  });
};
