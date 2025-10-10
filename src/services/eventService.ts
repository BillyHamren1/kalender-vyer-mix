import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

// Convert Supabase timestamp format to ISO 8601
const convertToISO8601 = (timestamp: string | null | undefined): string => {
  if (!timestamp) {
    console.warn('convertToISO8601: Invalid timestamp (null/undefined)');
    return new Date().toISOString(); // Fallback to current date
  }
  
  // If already in ISO format (contains 'T' and 'Z'), return as-is
  if (timestamp.includes('T') && (timestamp.includes('Z') || timestamp.includes('+'))) {
    return timestamp;
  }
  
  // Supabase format: "YYYY-MM-DD HH:MM:SS+00"
  // ISO 8601 format: "YYYY-MM-DDTHH:MM:SSZ"
  const converted = timestamp.replace(' ', 'T').replace('+00', 'Z');
  
  // Validate the converted date
  const testDate = new Date(converted);
  if (isNaN(testDate.getTime())) {
    console.error('convertToISO8601: Invalid date after conversion:', timestamp);
    return new Date().toISOString(); // Fallback to current date
  }
  
  return converted;
};

export interface CalendarEventUpdate {
  start?: string;
  end?: string;
  resourceId?: string;
  title?: string;
  delivery_address?: string;
}

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
    start: convertToISO8601(event.start_time),
    end: convertToISO8601(event.end_time),
    resourceId: event.resource_id,
    bookingId: event.booking_id,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: event.delivery_address,
    booking_number: event.booking_number,
    extendedProps: {
      bookingId: event.booking_id,
      booking_id: event.booking_id,
      resourceId: event.resource_id,
      deliveryAddress: event.delivery_address,
      deliveryCity: (event.bookings as any)?.delivery_city || null,
      deliveryPostalCode: (event.bookings as any)?.delivery_postal_code || null,
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
  
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      title: event.title,
      start_time: event.start,
      end_time: event.end,
      resource_id: event.resourceId,
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

  return {
    id: data.id,
    title: data.title,
    start: convertToISO8601(data.start_time),
    end: convertToISO8601(data.end_time),
    resourceId: data.resource_id,
    bookingId: data.booking_id,
    eventType: data.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: data.delivery_address,
    booking_number: data.booking_number,
    extendedProps: {
      bookingId: data.booking_id,
      booking_id: data.booking_id,
      resourceId: data.resource_id,
      deliveryAddress: data.delivery_address,
      deliveryCity: null,
      deliveryPostalCode: null,
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
    updateData.resource_id = updates.resourceId;
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

  return {
    id: data.id,
    title: data.title,
    start: convertToISO8601(data.start_time),
    end: convertToISO8601(data.end_time),
    resourceId: data.resource_id,
    bookingId: data.booking_id,
    eventType: data.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: data.delivery_address,
    booking_number: data.booking_number,
    extendedProps: {
      bookingId: data.booking_id,
      booking_id: data.booking_id,
      resourceId: data.resource_id,
      deliveryAddress: data.delivery_address,
      deliveryCity: null,
      deliveryPostalCode: null,
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
    start: convertToISO8601(event.start_time),
    end: convertToISO8601(event.end_time),
    resourceId: event.resource_id,
    bookingId: event.booking_id,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    delivery_address: event.delivery_address,
    booking_number: event.booking_number,
    extendedProps: {
      bookingId: event.booking_id,
      booking_id: event.booking_id,
      resourceId: event.resource_id,
      deliveryAddress: event.delivery_address,
      deliveryCity: null,
      deliveryPostalCode: null,
      bookingNumber: event.booking_number,
      eventType: event.event_type,
      manuallyAssigned: false
    }
  }));

  return events;
};
