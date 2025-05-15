
import { supabase } from "@/integrations/supabase/client";
import { CalendarEvent } from "@/components/Calendar/ResourceData";

// Fetch all calendar events
export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*');

  if (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }

  return data.map(event => ({
    id: event.id,
    resourceId: event.resource_id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    bookingId: event.booking_id,
  }));
};

// Add a calendar event
export const addCalendarEvent = async (event: Omit<CalendarEvent, 'id'>): Promise<string> => {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      resource_id: event.resourceId,
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
  const updateData: any = {};
  
  if (updates.resourceId) updateData.resource_id = updates.resourceId;
  if (updates.title) updateData.title = updates.title;
  if (updates.start) updateData.start_time = updates.start;
  if (updates.end) updateData.end_time = updates.end;
  if (updates.eventType) updateData.event_type = updates.eventType;

  const { error } = await supabase
    .from('calendar_events')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Error updating calendar event:', error);
    throw error;
  }
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
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('booking_id', bookingId);

  if (error) {
    console.error('Error fetching events for booking:', error);
    throw error;
  }

  return data.map(event => ({
    id: event.id,
    resourceId: event.resource_id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    bookingId: event.booking_id,
  }));
};

// Create or update events for a booking date change
export const syncBookingEvents = async (
  bookingId: string,
  eventType: 'rig' | 'event' | 'rigDown',
  date: string,
  resourceId: string = 'a',
  client: string
): Promise<string> => {
  // Check if an event already exists for this booking and event type
  const { data: existingEvents } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('event_type', eventType);

  // Create a start date object (at 9 AM)
  const startDate = new Date(date);
  startDate.setHours(9, 0, 0, 0);
  
  // End date (at 5 PM same day)
  const endDate = new Date(date);
  endDate.setHours(17, 0, 0, 0);

  let title = '';
  switch (eventType) {
    case 'rig':
      title = `${bookingId}: Rig Day - ${client}`;
      break;
    case 'event':
      title = `${bookingId}: Event Day - ${client}`;
      break;
    case 'rigDown':
      title = `${bookingId}: Rig Down Day - ${client}`;
      break;
  }

  if (existingEvents && existingEvents.length > 0) {
    // Update existing event
    const eventId = existingEvents[0].id;
    await supabase
      .from('calendar_events')
      .update({
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        title: title
      })
      .eq('id', eventId);
    
    return eventId;
  } else {
    // Create new event
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        resource_id: resourceId,
        booking_id: bookingId,
        title: title,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        event_type: eventType
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }

    return data.id;
  }
};
