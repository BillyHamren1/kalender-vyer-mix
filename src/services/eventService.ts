
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
  return reverseResourceIdMap[appResourceId] || appResourceId;
};

// Fetch all calendar events
export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*');

  if (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }

  // Map data to CalendarEvent format and convert resource IDs
  const mappedEvents = data.map(event => ({
    id: event.id,
    resourceId: mapDatabaseToAppResourceId(event.resource_id),
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    bookingId: event.booking_id,
  }));

  console.log('Calendar events loaded with mapped resource IDs:', mappedEvents);
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
  const updateData: any = {};
  
  if (updates.resourceId) {
    // Convert resourceId to database format
    updateData.resource_id = mapAppToDatabaseResourceId(updates.resourceId);
  }
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
    resourceId: mapDatabaseToAppResourceId(event.resource_id),
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    eventType: event.event_type as 'rig' | 'event' | 'rigDown',
    bookingId: event.booking_id,
  }));
};
