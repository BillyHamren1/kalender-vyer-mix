import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format, parseISO, differenceInHours } from 'date-fns';

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
    
    // CRITICAL: Parse and validate event times
    let startTime: Date;
    let endTime: Date;
    
    try {
      startTime = typeof event.start === 'string' ? parseISO(event.start) : new Date(event.start);
      endTime = typeof event.end === 'string' ? parseISO(event.end) : new Date(event.end);
      
      // Calculate duration in hours
      const durationHours = differenceInHours(endTime, startTime);
      console.log(`  ⏰ Duration: ${durationHours} hours (${format(startTime, 'HH:mm')} - ${format(endTime, 'HH:mm')})`);
      
      // Validate duration - warn if unusually short
      if (durationHours < 1) {
        console.warn(`  ⚠️ Very short event duration: ${durationHours} hours - this might be the problem!`);
      }
      
      // Validate times are not equal
      if (startTime.getTime() === endTime.getTime()) {
        console.error(`  ❌ Start and end times are identical - this will cause zero-height events!`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error parsing event times:`, error);
      console.error(`    Start: ${event.start} (type: ${typeof event.start})`);
      console.error(`    End: ${event.end} (type: ${typeof event.end})`);
      
      // Fallback to current time + 1 hour if parsing fails
      startTime = new Date();
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }
    
    console.log(`  Extended props:`, event.extendedProps);
    
    // Ensure the event has a valid resource ID
    let resourceId = event.resourceId;
    
    // If no resourceId or invalid resourceId, assign to first available team
    if (!resourceId || !validResourceIds.has(resourceId)) {
      console.warn(`Event ${event.id} has invalid resource ID: ${resourceId}, assigning to first team`);
      resourceId = resources.length > 0 ? resources[0].id : 'team-1';
    }
    
    // Get event color based on event type
    const eventColor = getEventColor(event.eventType);
    
    // CRITICAL FIX: Create proper title from booking data
    let eventTitle = event.title;
    
    // Try to get clean data from extendedProps first
    const bookingNumber = event.extendedProps?.bookingNumber || event.bookingNumber;
    const client = event.extendedProps?.client || event.client;
    
    console.log(`Title processing for event ${event.id}:`, {
      originalTitle: event.title,
      bookingNumber,
      client,
      extendedProps: event.extendedProps
    });
    
    // Priority 1: Use booking number + client if both available
    if (bookingNumber && client) {
      eventTitle = `${bookingNumber}: ${client}`;
      console.log(`✅ Using booking + client: "${eventTitle}"`);
    }
    // Priority 2: Use just client if available and title looks like UUID
    else if (client && (event.title.length > 30 || event.title.includes('-'))) {
      eventTitle = client;
      console.log(`✅ Using client only: "${eventTitle}"`);
    }
    // Priority 3: Use booking number if available and title looks like UUID
    else if (bookingNumber && (event.title.length > 30 || event.title.includes('-'))) {
      eventTitle = bookingNumber;
      console.log(`✅ Using booking number only: "${eventTitle}"`);
    }
    // Priority 4: Keep original title if it doesn't look like UUID
    else if (event.title && event.title.length <= 30 && !event.title.includes('-')) {
      eventTitle = event.title;
      console.log(`✅ Keeping original title: "${eventTitle}"`);
    }
    // Fallback: Use "Event" + short ID
    else {
      eventTitle = `Event ${event.id.substring(0, 8)}`;
      console.log(`⚠️ Using fallback title: "${eventTitle}"`);
    }
    
    const processedEvent = {
      ...event,
      title: eventTitle,
      // CRITICAL: Ensure proper ISO string format for FullCalendar
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      resourceId,
      backgroundColor: eventColor,
      borderColor: eventColor,
      textColor: '#ffffff',
      classNames: [`event-${event.eventType || 'default'}`, 'calendar-event'],
      extendedProps: {
        ...event.extendedProps,
        originalResourceId: event.resourceId,
        eventType: event.eventType,
        bookingId: event.bookingId,
        deliveryAddress: event.deliveryAddress,
        bookingNumber: bookingNumber,
        client: client,
        // Add duration info for debugging
        durationHours: differenceInHours(endTime, startTime),
        startTime: format(startTime, 'HH:mm'),
        endTime: format(endTime, 'HH:mm')
      }
    };
    
    console.log(`  ✅ Processed event "${eventTitle}" with duration: ${differenceInHours(endTime, startTime)} hours`);
    console.log(`  📅 Times: ${format(startTime, 'yyyy-MM-dd HH:mm')} → ${format(endTime, 'yyyy-MM-dd HH:mm')}`);
    
    return processedEvent;
  });

  console.log(`=== Processing Complete ===`);
  console.log(`Input events: ${events.length}`);
  console.log(`Output events: ${processedEvents.length}`);
  console.log('FINAL PROCESSED EVENTS WITH DURATIONS:', processedEvents.map(e => ({ 
    id: e.id, 
    title: e.title, 
    start: e.start, 
    end: e.end,
    duration: e.extendedProps?.durationHours + 'h'
  })));
  
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
