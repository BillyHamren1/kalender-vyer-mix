import { CalendarEvent, Resource } from './ResourceData';
import { mapDatabaseToAppResourceId } from '@/services/eventService';

export const processEvents = (events: CalendarEvent[], resources: Resource[]): CalendarEvent[] => {
  console.log('Processing events:', events.length);
  console.log('Available resources:', resources.map(r => `${r.id}: ${r.title}`));
  
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
    // Check if this event is manually assigned - if so, NEVER change it
    const isManuallyAssigned = event.extendedProps?.manuallyAssigned || false;
    if (isManuallyAssigned) {
      console.log(`✋ Event ${event.id} is manually assigned to ${event.resourceId}, preserving assignment`);
      
      // Just ensure the resource is valid, but don't change it
      const validResource = resources.find(r => r.id === event.resourceId);
      if (!validResource) {
        console.warn(`⚠️ Manually assigned event ${event.id} has invalid resourceId: ${event.resourceId}, but preserving it`);
      }
      
      return {
        ...event,
        editable: true,
        startEditable: true,
        durationEditable: true,
        resourceEditable: true,
        constraint: undefined,
        overlap: true,
        allow: () => true,
        extendedProps: {
          ...event.extendedProps,
          manuallyAssigned: true,
          // Enhanced hover data
          client: event.extendedProps?.client || event.title?.split(':')[1]?.trim() || 'Unknown Client',
          deliveryCity: event.extendedProps?.deliveryCity || 'Unknown City',
          deliveryPostalCode: event.extendedProps?.deliveryPostalCode || '',
          exactTimeNeeded: event.extendedProps?.exactTimeNeeded || false,
          exactTimeInfo: event.extendedProps?.exactTimeInfo || '',
          internalNotes: event.extendedProps?.internalNotes || '',
          carryMoreThan10m: event.extendedProps?.carryMoreThan10m || false,
          groundNailsAllowed: event.extendedProps?.groundNailsAllowed || false,
          products: event.extendedProps?.products || []
        }
      };
    }
    
    // For non-manually assigned events, proceed with auto-assignment logic
    
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
    
    // DEBUG: Log the current event processing
    console.log(`Processing auto-assigned event ${event.id}:`, {
      title: event.title,
      originalResourceId: event.resourceId,
      normalizedResourceId,
      targetResourceId,
      eventType
    });
    
    // Check if this is an EVENT type that should potentially be auto-assigned to team-6
    if (eventType === 'event') {
      // Only auto-assign to team-6 if the event is currently on a team that seems auto-assigned
      // This respects manual drag operations to other teams
      const bookingId = event.extendedProps?.bookingId || event.bookingId;
      
      // If the event is already on team-6 or has no specific team assignment, use team-6
      // Otherwise, respect the current team assignment (user may have dragged it)
      if (targetResourceId === 'team-6' || !targetResourceId || targetResourceId === 'team-1') {
        targetResourceId = 'team-6';
        console.log(`Auto-assigning EVENT type event ${event.id} to team-6`);
      } else {
        // Event has been manually assigned to a specific team - respect that choice
        console.log(`Respecting manual assignment of EVENT type event ${event.id} to ${targetResourceId}`);
      }
      
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
          manuallyAssigned: false, // Mark as auto-assigned
          // Enhanced hover data
          client: event.extendedProps?.client || event.title?.split(':')[1]?.trim() || 'Unknown Client',
          deliveryCity: event.extendedProps?.deliveryCity || 'Unknown City',
          deliveryPostalCode: event.extendedProps?.deliveryPostalCode || '',
          exactTimeNeeded: event.extendedProps?.exactTimeNeeded || false,
          exactTimeInfo: event.extendedProps?.exactTimeInfo || '',
          internalNotes: event.extendedProps?.internalNotes || '',
          carryMoreThan10m: event.extendedProps?.carryMoreThan10m || false,
          groundNailsAllowed: event.extendedProps?.groundNailsAllowed || false,
          products: event.extendedProps?.products || []
        }
      };

      console.log(`✅ Processed EVENT type event ${event.id}: assigned to ${targetResourceId} (was ${event.resourceId})`);
      return processedEvent;
    }

    // For non-EVENT types, check if events in the same booking should stay together
    const bookingId = event.extendedProps?.bookingId || event.bookingId;
    if (bookingId && eventsByBooking.has(bookingId)) {
      const bookingEvents = eventsByBooking.get(bookingId)!;
      
      // Check if any event in this booking has been manually assigned to a non-default team
      const manuallyAssignedEvent = bookingEvents.find(e => {
        const eResourceId = e.resourceId;
        const eIsManuallyAssigned = e.extendedProps?.manuallyAssigned || false;
        // Consider it manually assigned if it's flagged OR not on team-6 (default for EVENT) or team-1 (fallback)
        return eIsManuallyAssigned || (eResourceId !== 'team-6' && eResourceId !== 'team-1' && eResourceId.startsWith('team-'));
      });
      
      if (manuallyAssignedEvent) {
        // Use the manually assigned team for consistency
        targetResourceId = manuallyAssignedEvent.resourceId;
        console.log(`Using manually assigned team ${targetResourceId} for booking ${bookingId} events`);
      } else {
        // Use the booking ID to determine consistent team assignment (original logic)
        const bookingHash = bookingId.split('-')[0];
        const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5'];
        const baseTeamIndex = parseInt(bookingHash, 16) % teams.length;
        targetResourceId = teams[baseTeamIndex];
        console.log(`Assigning booking ${bookingId} events to consistent team: ${targetResourceId}`);
      }
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
        manuallyAssigned: false, // Mark as auto-assigned
        // Enhanced hover data
        client: event.extendedProps?.client || event.title?.split(':')[1]?.trim() || 'Unknown Client',
        deliveryCity: event.extendedProps?.deliveryCity || 'Unknown City',
        deliveryPostalCode: event.extendedProps?.deliveryPostalCode || '',
        exactTimeNeeded: event.extendedProps?.exactTimeNeeded || false,
        exactTimeInfo: event.extendedProps?.exactTimeInfo || '',
        internalNotes: event.extendedProps?.internalNotes || '',
        carryMoreThan10m: event.extendedProps?.carryMoreThan10m || false,
        groundNailsAllowed: event.extendedProps?.groundNailsAllowed || false,
        products: event.extendedProps?.products || []
      }
    };

    console.log(`✅ Processed ${eventType || 'unknown'} type event ${event.id}:`, {
      title: event.title,
      bookingId: processedEvent.extendedProps.bookingId,
      finalResourceId: processedEvent.resourceId,
      originalResourceId: event.resourceId,
      eventType: eventType,
      client: processedEvent.extendedProps.client,
      manuallyAssigned: false
    });

    return processedEvent;
  });
};
