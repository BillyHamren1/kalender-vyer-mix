import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format, parseISO, differenceInHours, differenceInMinutes, isValid } from 'date-fns';

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
    
    // FIXED: Simple and direct time parsing without adding days
    let startTime: Date;
    let endTime: Date;
    
    try {
      // Parse the ISO strings directly - NO MODIFICATIONS
      startTime = typeof event.start === 'string' ? parseISO(event.start) : new Date(event.start);
      endTime = typeof event.end === 'string' ? parseISO(event.end) : new Date(event.end);
      
      // Validate parsed dates
      if (!isValid(startTime) || !isValid(endTime)) {
        throw new Error('Invalid date parsing');
      }
      
      console.log(`  ⏰ DIRECT time parsing (NO MODIFICATIONS):`);
      console.log(`    Start: ${format(startTime, 'yyyy-MM-dd HH:mm:ss')} (${startTime.toISOString()})`);
      console.log(`    End: ${format(endTime, 'yyyy-MM-dd HH:mm:ss')} (${endTime.toISOString()})`);
      
    } catch (error) {
      console.error(`  ❌ Error parsing event times:`, error);
      console.error(`    Start: ${event.start} (type: ${typeof event.start})`);
      console.error(`    End: ${event.end} (type: ${typeof event.end})`);
      
      // Fallback to current time + 1 hour if parsing fails
      startTime = new Date();
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      console.log(`  🔄 Using fallback times: ${format(startTime, 'HH:mm')} - ${format(endTime, 'HH:mm')}`);
    }
    
    // FIXED: Calculate duration directly in minutes then convert to hours with decimals
    const durationMinutes = differenceInMinutes(endTime, startTime);
    const durationHours = Math.round((durationMinutes / 60) * 100) / 100; // Round to 2 decimal places
    
    console.log(`  📊 CORRECTED Duration Calculation:`);
    console.log(`    Minutes: ${durationMinutes}`);
    console.log(`    Hours: ${durationHours}`);
    console.log(`    Start: ${format(startTime, 'HH:mm')}`);
    console.log(`    End: ${format(endTime, 'HH:mm')}`);
    
    // Validate duration - should be reasonable
    if (durationHours < 0) {
      console.error(`  ❌ NEGATIVE DURATION: ${durationHours} hours - this indicates a parsing error!`);
    }
    
    if (durationHours > 24) {
      console.warn(`  ⚠️ Very long event duration: ${durationHours} hours - verify this is correct`);
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
    
    // Create proper title from booking data
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
      // CRITICAL: Use the original times without modification
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      resourceId,
      backgroundColor: eventColor,
      borderColor: eventColor,
      textColor: '#ffffff',
      classNames: [`event-${event.eventType || 'default'}`, 'calendar-event'],
      // CRITICAL: Enable drag and drop by setting these properties
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
        client: client,
        // CORRECTED timing info with proper calculation
        durationHours: durationHours,
        startTime: format(startTime, 'HH:mm'),
        endTime: format(endTime, 'HH:mm'),
        startDateTime: startTime.toISOString(),
        endDateTime: endTime.toISOString(),
        // Add local time for display
        localStartTime: format(startTime, 'HH:mm'),
        localEndTime: format(endTime, 'HH:mm')
      }
    };
    
    console.log(`  ✅ Processed event "${eventTitle}":`);
    console.log(`    CORRECTED Duration: ${durationHours} hours`);
    console.log(`    Times: ${format(startTime, 'HH:mm')} → ${format(endTime, 'HH:mm')}`);
    console.log(`    ISO Start: ${startTime.toISOString()}`);
    console.log(`    ISO End: ${endTime.toISOString()}`);
    console.log(`    Editable: ${processedEvent.editable}`);
    
    return processedEvent;
  });

  console.log(`=== Processing Complete ===`);
  console.log(`Input events: ${events.length}`);
  console.log(`Output events: ${processedEvents.length}`);
  console.log('FINAL PROCESSED EVENTS WITH CORRECTED DURATIONS:', processedEvents.map(e => ({ 
    id: e.id, 
    title: e.title, 
    start: e.start, 
    end: e.end,
    duration: e.extendedProps?.durationHours + 'h',
    localTimes: `${e.extendedProps?.localStartTime} - ${e.extendedProps?.localEndTime}`,
    editable: e.editable
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
