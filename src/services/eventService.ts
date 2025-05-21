import { supabase } from "@/integrations/supabase/client";
import { CalendarEvent } from "@/components/Calendar/ResourceData";
import { getEventColor } from "@/components/Calendar/ResourceData";

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
  console.log('Fetching all calendar events from the database...');
  
  // First, fetch all the events
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*');

  if (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }

  console.log('Raw calendar events from database:', data);

  // Get all unique booking IDs to fetch their delivery addresses
  const bookingIds = data
    .filter(event => event.booking_id)
    .map(event => event.booking_id)
    .filter((id, index, self) => id && self.indexOf(id) === index); // Only unique, non-null booking IDs

  // Fetch delivery addresses for all bookings in one request
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('id, deliveryaddress, delivery_city')
    .in('id', bookingIds);

  if (bookingError) {
    console.error('Error fetching booking addresses:', bookingError);
    // Continue with the events even if we couldn't get the addresses
  }

  // Create a map of booking IDs to delivery addresses
  const bookingAddresses: Record<string, string> = {};
  if (bookingData) {
    bookingData.forEach(booking => {
      const address = booking.deliveryaddress || '';
      const city = booking.delivery_city || '';
      
      // Format the address to only include street address and city, not postal code
      const formattedAddress = [
        address,
        city
      ].filter(Boolean).join(', ');
      
      bookingAddresses[booking.id] = formattedAddress || 'No address provided';
    });
  }

  // Map data to CalendarEvent format and convert resource IDs
  const mappedEvents = data.map(event => {
    const mappedResourceId = mapDatabaseToAppResourceId(event.resource_id);
    const eventType = event.event_type as 'rig' | 'event' | 'rigDown';
    const bookingId = event.booking_id || '';
    
    // Get the delivery address for this event's booking
    const deliveryAddress = bookingAddresses[bookingId] || 'No address provided';
    
    const calendarEvent: CalendarEvent = {
      id: event.id,
      resourceId: mappedResourceId,
      title: event.title,
      start: event.start_time,
      end: event.end_time,
      eventType: eventType,
      bookingId: bookingId,
      color: getEventColor(eventType),
      deliveryAddress: deliveryAddress
    };
    
    return calendarEvent;
  });

  console.log('Mapped calendar events with app resource IDs and addresses:', mappedEvents);
  return mappedEvents;
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
      color: getEventColor(eventType)
    };
  });
};
