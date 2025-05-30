import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

export interface CalendarEventUpdate {
  start?: string;
  end?: string;
  resourceId?: string;
  title?: string;
  delivery_address?: string;
}

// Map database resource ID format to app format
export const mapDatabaseToAppResourceId = (dbResourceId: string): string => {
  // Single character IDs are legacy format - convert to team-X
  if (dbResourceId && dbResourceId.length === 1) {
    const charCode = dbResourceId.charCodeAt(0);
    
    // Map a=1, b=2, c=3, d=4, e=5, f=6, etc.
    if (charCode >= 97 && charCode <= 122) { // lowercase a-z
      const teamNumber = charCode - 96; // a=1, b=2, etc.
      const mappedId = `team-${teamNumber}`;
      console.log(`🔄 Mapping database ID "${dbResourceId}" to app format`);
      console.log(`✅ Mapped "${dbResourceId}" -> "${mappedId}"`);
      return mappedId;
    }
    
    // If it's a number, map directly
    if (!isNaN(parseInt(dbResourceId))) {
      return `team-${dbResourceId}`;
    }
  }
  
  // If already in team-X format or other valid format, return as-is
  return dbResourceId;
};

// Map app resource ID format to database format
export const mapAppToDatabaseResourceId = (appResourceId: string): string => {
  // Convert team-X format to single character for database storage
  if (appResourceId && appResourceId.startsWith('team-')) {
    const teamNumber = parseInt(appResourceId.replace('team-', ''));
    if (teamNumber >= 1 && teamNumber <= 26) {
      // Map 1=a, 2=b, 3=c, 4=d, 5=e, 6=f, etc.
      const dbId = String.fromCharCode(96 + teamNumber); // 96 + 1 = 97 (a)
      console.log(`🔄 Converting app ID "${appResourceId}" to database format`);
      console.log(`✅ Converted "${appResourceId}" -> "${dbId}"`);
      return dbId;
    }
  }
  
  // Return as-is if not in team-X format
  return appResourceId;
};

export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  console.log('📅 Fetching calendar events from database...');
  
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      resource_id,
      booking_id,
      event_type,
      delivery_address,
      booking_number,
      bookings!inner(
        delivery_city,
        delivery_postal_code
      )
    `)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('❌ Error fetching calendar events:', error);
    throw error;
  }

  console.log(`✅ Fetched ${data?.length || 0} calendar events`);

  // Transform the data to match CalendarEvent interface
  const events: CalendarEvent[] = (data || []).map(event => ({
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    resourceId: mapDatabaseToAppResourceId(event.resource_id),
    bookingId: event.booking_id,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: event.delivery_address,
    booking_number: event.booking_number,
    extendedProps: {
      bookingId: event.booking_id,
      booking_id: event.booking_id,
      resourceId: mapDatabaseToAppResourceId(event.resource_id),
      deliveryAddress: event.delivery_address,
      deliveryCity: event.bookings?.delivery_city || null,
      deliveryPostalCode: event.bookings?.delivery_postal_code || null,
      bookingNumber: event.booking_number,
      eventType: event.event_type,
      manuallyAssigned: false
    }
  }));

  return events;
};

// Add the missing createCalendarEvent function (alias for addCalendarEvent)
export const createCalendarEvent = async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
  return addCalendarEvent(event);
};

export const addCalendarEvent = async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
  console.log('📝 Adding new calendar event:', event);
  
  // Convert app resource ID to database format before saving
  const dbResourceId = mapAppToDatabaseResourceId(event.resourceId);
  
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      resource_id: dbResourceId,
      booking_id: event.bookingId,
      event_type: event.eventType,
      delivery_address: event.delivery_address,
      booking_number: event.booking_number
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error adding calendar event:', error);
    throw error;
  }

  console.log('✅ Calendar event added successfully:', data);

  // Return the event with app-format resource ID
  return {
    id: data.id,
    title: data.title,
    start: data.start_time,
    end: data.end_time,
    resourceId: mapDatabaseToAppResourceId(data.resource_id),
    bookingId: data.booking_id,
    eventType: data.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: data.delivery_address,
    booking_number: data.booking_number,
    extendedProps: {
      bookingId: data.booking_id,
      booking_id: data.booking_id,
      resourceId: mapDatabaseToAppResourceId(data.resource_id),
      deliveryAddress: data.delivery_address,
      deliveryCity: data.bookings?.delivery_city || null,
      deliveryPostalCode: data.bookings?.delivery_postal_code || null,
      bookingNumber: data.booking_number,
      eventType: data.event_type,
      manuallyAssigned: false
    }
  };
};

export const updateCalendarEvent = async (
  eventId: string, 
  updates: CalendarEventUpdate
): Promise<CalendarEvent> => {
  console.log('📝 Updating calendar event:', eventId, updates);
  
  // Prepare the update data
  const updateData: any = {};
  
  if (updates.start) {
    updateData.start_time = updates.start;
  }
  
  if (updates.end) {
    updateData.end_time = updates.end;
  }
  
  if (updates.resourceId) {
    // Convert app format to database format
    updateData.resource_id = mapAppToDatabaseResourceId(updates.resourceId);
    console.log(`🔄 Resource change: ${updates.resourceId} -> ${updateData.resource_id}`);
  }
  
  if (updates.title) {
    updateData.title = updates.title;
  }
  
  if (updates.delivery_address) {
    updateData.delivery_address = updates.delivery_address;
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating calendar event:', error);
    throw error;
  }

  console.log('✅ Calendar event updated successfully:', data);

  // Return the updated event with app-format resource ID
  return {
    id: data.id,
    title: data.title,
    start: data.start_time,
    end: data.end_time,
    resourceId: mapDatabaseToAppResourceId(data.resource_id),
    bookingId: data.booking_id,
    eventType: data.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: data.delivery_address,
    booking_number: data.booking_number,
    extendedProps: {
      bookingId: data.booking_id,
      booking_id: data.booking_id,
      resourceId: mapDatabaseToAppResourceId(data.resource_id),
      deliveryAddress: data.delivery_address,
      deliveryCity: data.bookings?.delivery_city || null,
      deliveryPostalCode: data.bookings?.delivery_postal_code || null,
      bookingNumber: data.booking_number,
      eventType: data.event_type,
      manuallyAssigned: false
    }
  };
};

export const deleteCalendarEvent = async (eventId: string): Promise<void> => {
  console.log('🗑️ Deleting calendar event:', eventId);
  
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.error('❌ Error deleting calendar event:', error);
    throw error;
  }

  console.log('✅ Calendar event deleted successfully');
};

export const fetchEventsByBookingId = async (bookingId: string): Promise<CalendarEvent[]> => {
  console.log('📅 Fetching calendar events for booking:', bookingId);
  
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      resource_id,
      booking_id,
      event_type,
      delivery_address,
      booking_number
    `)
    .eq('booking_id', bookingId)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('❌ Error fetching calendar events for booking:', error);
    throw error;
  }

  console.log(`✅ Fetched ${data?.length || 0} calendar events for booking ${bookingId}`);

  // Transform the data to match CalendarEvent interface
  const events: CalendarEvent[] = (data || []).map(event => ({
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    resourceId: mapDatabaseToAppResourceId(event.resource_id),
    bookingId: event.booking_id,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: event.delivery_address,
    booking_number: event.booking_number,
    extendedProps: {
      bookingId: event.booking_id,
      booking_id: event.booking_id,
      resourceId: mapDatabaseToAppResourceId(event.resource_id),
      deliveryAddress: event.delivery_address,
      deliveryCity: event.bookings?.delivery_city || null,
      deliveryPostalCode: event.bookings?.delivery_postal_code || null,
      bookingNumber: event.booking_number,
      eventType: event.event_type,
      manuallyAssigned: false
    }
  }));

  return events;
};
