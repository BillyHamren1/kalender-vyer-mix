import { CalendarEvent, Resource } from './ResourceData';
import { mapDatabaseToAppResourceId } from '@/services/eventService';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('Processing events:', events.length);
  
  // Group events by booking ID to ensure consistent team assignment
  const eventsByBooking = new Map<string, CalendarEvent[]>();
  
  events.forEach(event => {
    const bookingId = event.extendedProps?.bookingId || event.bookingId || 'no-booking';
    if (!eventsByBooking.has(bookingId)) {
      eventsByBooking.set(bookingId, []);
    }
    eventsByBooking.get(bookingId)!.push(event);
  });
  
  return events.map(event => {
    // Normalize resource ID - convert database format to app format
    let normalizedResourceId = event.resourceId;
    
    if (event.resourceId && event.resourceId.length === 1) {
      normalizedResourceId = mapDatabaseToAppResourceId(event.resourceId);
      console.log(`Converted resource ID from "${event.resourceId}" to "${normalizedResourceId}"`);
    }
    
    // Ensure the normalized resource ID is valid
    let targetResourceId = normalizedResourceId;
    const validResource = resources.find(r => r.id === normalizedResourceId);
    
    if (!validResource) {
      console.warn(`Event ${event.id} has invalid resourceId: ${normalizedResourceId}, falling back to first resource`);
      targetResourceId = resources[0]?.id || 'team-1';
    }

    // Get the actual event type
    const eventType = event.extendedProps?.eventType || event.eventType;
    
    // Force EVENT type events to team-6 (Todays events)
    if (eventType === 'event') {
      targetResourceId = 'team-6';
      
      // Set EVENT events to 2.5 hours duration
      const startTime = new Date(event.start);
      const endTime = new Date(startTime);
      endTime.setTime(startTime.getTime() + (2.5 * 60 * 60 * 1000));
      
      const processedEvent = {
        ...event,
        resourceId: targetResourceId,
        end: endTime.toISOString(),
        editable: true,
        startEditable: true,
        durationEditable: true,
        resourceEditable: true,
        constraint: undefined,
        overlap: true,
        allow: () => true,
        extendedProps: {
          ...event.extendedProps,
          bookingId: event.extendedProps?.bookingId || event.bookingId,
          booking_id: event.extendedProps?.booking_id || event.bookingId,
          resourceId: targetResourceId,
          deliveryAddress: event.extendedProps?.deliveryAddress || event.delivery_address,
          bookingNumber: event.extendedProps?.bookingNumber || event.booking_number,
          eventType: eventType,
          originalResourceId: normalizedResourceId,
          // Enhanced hover data
          client: event.extendedProps?.client || event.title?.split(':')[1]?.trim() || 'Unknown Client',
          deliveryCity: event.extendedProps?.deliveryCity || 'Unknown City',
          deliveryPostalCode: event.extendedProps?.deliveryPostalCode || '',
          exactTimeNeeded: event.extendedProps?.exactTimeNeeded || false,
          exactTimeInfo: event.extendedProps?.exactTimeInfo || '',
          internalNotes: event.extendedProps?.internalNotes || '',
          carryMoreThan10m: event.extendedProps?.carryMoreThan10m || false,
          groundNailsAllowed: event.extendedProps?.groundNailsAllowed || false,
          // Products data for hover
          products: event.extendedProps?.products || []
        }
      };

      console.log(`Processed EVENT type event ${event.id}: moved to team-6 with enhanced data`);
      return processedEvent;
    }

    // For non-EVENT types, keep consistent team assignment within booking
    const bookingId = event.extendedProps?.bookingId || event.bookingId;
    if (bookingId && eventsByBooking.has(bookingId)) {
      const bookingEvents = eventsByBooking.get(bookingId)!;
      
      // Use the booking ID to determine consistent team assignment
      const bookingHash = bookingId.split('-')[0];
      const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
      const baseTeamIndex = parseInt(bookingHash, 16) % teams.length;
      targetResourceId = teams[baseTeamIndex];
      
      console.log(`Assigning booking ${bookingId} events to consistent team: ${targetResourceId}`);
    }

    const processedEvent = {
      ...event,
      resourceId: targetResourceId,
      editable: true,
      startEditable: true,
      durationEditable: true,
      resourceEditable: true,
      constraint: undefined,
      overlap: true,
      allow: () => true,
      extendedProps: {
        ...event.extendedProps,
        bookingId: event.extendedProps?.bookingId || event.bookingId,
        booking_id: event.extendedProps?.booking_id || event.bookingId,
        resourceId: targetResourceId,
        deliveryAddress: event.extendedProps?.deliveryAddress || event.delivery_address,
        bookingNumber: event.extendedProps?.bookingNumber || event.booking_number,
        eventType: eventType,
        // Enhanced hover data
        client: event.extendedProps?.client || event.title?.split(':')[1]?.trim() || 'Unknown Client',
        deliveryCity: event.extendedProps?.deliveryCity || 'Unknown City',
        deliveryPostalCode: event.extendedProps?.deliveryPostalCode || '',
        exactTimeNeeded: event.extendedProps?.exactTimeNeeded || false,
        exactTimeInfo: event.extendedProps?.exactTimeInfo || '',
        internalNotes: event.extendedProps?.internalNotes || '',
        carryMoreThan10m: event.extendedProps?.carryMoreThan10m || false,
        groundNailsAllowed: event.extendedProps?.groundNailsAllowed || false,
        // Products data for hover
        products: event.extendedProps?.products || []
      }
    };

    console.log(`Processed ${eventType || 'unknown'} type event ${event.id}:`, {
      title: event.title,
      bookingId: processedEvent.extendedProps.bookingId,
      resourceId: processedEvent.resourceId,
      eventType: eventType,
      client: processedEvent.extendedProps.client
    });

    return processedEvent;
  });
};
