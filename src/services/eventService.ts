
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
