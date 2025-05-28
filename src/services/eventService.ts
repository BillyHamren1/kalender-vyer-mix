import { supabase } from "@/integrations/supabase/client";
import { CalendarEvent } from "@/components/Calendar/ResourceData";

// Resource ID mapping - converts between database IDs and application format
const resourceIdMap: Record<string, string> = {
  'a': 'team-1',
  'b': 'team-2',
  'c': 'team-3',
  'd': 'team-4',
  'e': 'team-5',
  'f': 'team-6',
  'g': 'team-7',
  'h': 'team-8',
  'i': 'team-9',
  'j': 'team-10'
};

// Reverse mapping for saving to database
const reverseResourceIdMap: Record<string, string> = Object.entries(resourceIdMap)
  .reduce((map, [key, value]) => ({ ...map, [value]: key }), {});

// Convert database resource ID to application format
export const mapDatabaseToAppResourceId = (dbResourceId: string): string => {
  // If it's already in team-X format, return as is
  if (dbResourceId.startsWith('team-')) {
    return dbResourceId;
  }
  // Return mapped ID or original if not found in the map
  return resourceIdMap[dbResourceId] || `team-${dbResourceId}`;
};

// Convert application resource ID to database format
export const mapAppToDatabaseResourceId = (appResourceId: string): string => {
  // If it's already a single character like 'a', 'b', etc., return as is
  if (appResourceId.length === 1 && reverseResourceIdMap[`team-${appResourceId}`]) {
    return appResourceId;
  }
  
  // Handle direct team-X format
  const result = reverseResourceIdMap[appResourceId];
  
  if (result) {
    console.log(`Mapped app ID ${appResourceId} to database ID ${result}`);
    return result;
  }
  
  // If the ID has format "team-X" but isn't in our map, extract the X
  if (appResourceId.startsWith('team-')) {
    const teamNumber = appResourceId.split('-')[1];
    console.log(`Team ID ${appResourceId} not in mapping, using extracted value ${teamNumber}`);
    return teamNumber;
  }
  
  console.log(`No mapping found for ${appResourceId}, using as is`);
  return appResourceId;
};

// Fetch all calendar events
export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  console.log('Fetching calendar events with booking details...');
  
  try {
    // Fetch calendar events with associated booking data and products
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select(`
        *,
        bookings!calendar_events_booking_id_fkey (
          id,
          client,
          booking_number,
          deliveryaddress,
          delivery_city,
          delivery_postal_code,
          internalnotes,
          carry_more_than_10m,
          ground_nails_allowed,
          exact_time_needed,
          exact_time_info,
          booking_products (
            id,
            name,
            quantity,
            notes
          )
        )
      `)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }

    if (!events) {
      console.log('No calendar events found');
      return [];
    }

    console.log(`Fetched ${events.length} calendar events from database`);

    // Transform the data to match CalendarEvent interface
    const calendarEvents: CalendarEvent[] = events.map((event: any) => {
      const booking = event.bookings;
      
      // Transform products data if available
      const products = booking?.booking_products?.map((product: any) => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        notes: product.notes || undefined
      })) || [];

      console.log(`Event ${event.id} - Products:`, products, 'Internal notes:', booking?.internalnotes);

      return {
        id: event.id,
        title: event.title,
        start: new Date(event.start_time),
        end: new Date(event.end_time),
        resourceId: event.resource_id,
        extendedProps: {
          bookingId: event.booking_id,
          bookingNumber: event.booking_number || booking?.booking_number,
          eventType: event.event_type,
          deliveryAddress: event.delivery_address || booking?.deliveryaddress,
          deliveryCity: booking?.delivery_city,
          deliveryPostalCode: booking?.delivery_postal_code,
          internalNotes: booking?.internalnotes,
          products: products, // Include products array
          carryMoreThan10m: booking?.carry_more_than_10m,
          groundNailsAllowed: booking?.ground_nails_allowed,
          exactTimeNeeded: booking?.exact_time_needed,
          exactTimeInfo: booking?.exact_time_info
        }
      };
    });

    console.log('Transformed calendar events:', calendarEvents.length, 'events with extended props');
    return calendarEvents;

  } catch (error) {
    console.error('Error in fetchCalendarEvents:', error);
    throw error;
  }
};

// Add a calendar event
export const addCalendarEvent = async (event: Omit<CalendarEvent, 'id'>): Promise<string> => {
  // Convert resourceId to database format
  const dbResourceId = mapAppToDatabaseResourceId(event.resourceId);

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      resource_id: dbResourceId,
      booking_id: event.bookingId,
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      event_type: event.eventType,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error adding calendar event:', error);
    throw error;
  }

  return data.id;
};

// Update a calendar event
export const updateCalendarEvent = async (
  id: string,
  updates: Partial<Omit<CalendarEvent, 'id'>>
): Promise<void> => {
  console.log(`Updating calendar event ${id} with:`, updates);
  
  const updateData: any = {};
  
  if (updates.resourceId) {
    // Convert resourceId to database format
    updateData.resource_id = mapAppToDatabaseResourceId(updates.resourceId);
    console.log(`Converted resource ID ${updates.resourceId} to ${updateData.resource_id} for database update`);
  }
  if (updates.title) updateData.title = updates.title;
  if (updates.start) updateData.start_time = updates.start;
  if (updates.end) updateData.end_time = updates.end;
  if (updates.eventType) updateData.event_type = updates.eventType;

  console.log('Final update data for database:', updateData);

  const { error } = await supabase
    .from('calendar_events')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Error updating calendar event:', error);
    throw error;
  }
  
  console.log(`Successfully updated event ${id} in database`);
};

// Delete a calendar event
export const deleteCalendarEvent = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting calendar event:', error);
    throw error;
  }
};

// Fetch calendar events by booking ID
export const fetchEventsByBookingId = async (bookingId: string): Promise<CalendarEvent[]> => {
  console.log(`Fetching events for booking ID: ${bookingId}`);
  
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('booking_id', bookingId);

  if (error) {
    console.error('Error fetching events for booking:', error);
    throw error;
  }

  console.log(`Found ${data.length} events for booking ID ${bookingId}:`, data);

  return data.map(event => {
    const eventType = event.event_type as 'rig' | 'event' | 'rigDown';
    
    return {
      id: event.id,
      resourceId: mapDatabaseToAppResourceId(event.resource_id),
      title: event.title,
      start: event.start_time,
      end: event.end_time,
      eventType: eventType,
      bookingId: event.booking_id,
      bookingNumber: event.booking_number || event.booking_id || 'No ID',
      deliveryAddress: event.delivery_address || 'No address provided'
    };
  });
};

// Create a calendar event
export const createCalendarEvent = async (eventData: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent | null> => {
  try {
    console.log('Creating calendar event with data:', eventData);
    
    // Map application resource ID to database format
    const dbResourceId = mapAppToDatabaseResourceId(eventData.resourceId);
    
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        title: eventData.title,
        start_time: eventData.start,
        end_time: eventData.end,
        resource_id: dbResourceId,
        event_type: eventData.eventType || 'event',
        delivery_address: eventData.deliveryAddress,
        booking_id: eventData.bookingId,
        booking_number: eventData.bookingNumber,
        viewed: eventData.viewed || false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }

    if (data) {
      // Convert back to application format
      const calendarEvent: CalendarEvent = {
        id: data.id,
        title: data.title,
        start: data.start_time,
        end: data.end_time,
        resourceId: mapDatabaseToAppResourceId(data.resource_id),
        eventType: data.event_type as 'rig' | 'event' | 'rigDown',
        deliveryAddress: data.delivery_address,
        bookingId: data.booking_id,
        bookingNumber: data.booking_number,
        viewed: data.viewed
      };

      console.log('Created calendar event:', calendarEvent);
      return calendarEvent;
    }

    return null;
  } catch (error) {
    console.error('Error in createCalendarEvent:', error);
    throw error;
  }
};
