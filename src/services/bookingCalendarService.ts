import { supabase } from "@/integrations/supabase/client";
import { findAvailableTeam } from "./teamService";

// Create or update events for a booking date change
export const syncBookingEvents = async (
  bookingId: string,
  eventType: 'rig' | 'event' | 'rigDown',
  date: string | string[],
  resourceId: string = 'auto',
  client: string,
  deliveryAddress?: string
): Promise<string | string[]> => {
  // Convert single date to array for consistent handling
  const dates = Array.isArray(date) ? date : [date];
  const eventIds: string[] = [];

  // Process each date in the array
  for (const singleDate of dates) {
    // For each date, check if an event already exists for this booking, event type, and date
    const startDate = new Date(singleDate);
    startDate.setHours(9, 0, 0, 0);
    
    const endDate = new Date(singleDate);
    endDate.setHours(17, 0, 0, 0);

    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('event_type', eventType)
      .eq('start_time', startDate.toISOString())
      .eq('end_time', endDate.toISOString());

    // If resourceId is 'auto', find an available team
    let teamId = resourceId;
    if (resourceId === 'auto') {
      teamId = await findAvailableTeam(startDate, endDate);
    }

    // Simplified title with no day text, just booking ID and client name
    const title = `${bookingId}: ${client}`;
    
    // Prepare the data to be saved
    const eventData = {
      resource_id: teamId,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      title: title,
      event_type: eventType,
      booking_id: bookingId,
      delivery_address: deliveryAddress || null
    };

    console.log(`Creating/updating calendar event for ${singleDate}:`, eventData);

    if (existingEvents && existingEvents.length > 0) {
      // Update existing event
      const eventId = existingEvents[0].id;
      const { error } = await supabase
        .from('calendar_events')
        .update(eventData)
        .eq('id', eventId);
        
      if (error) {
        console.error('Error updating calendar event:', error);
        throw error;
      }
      
      console.log("Updated existing calendar event with ID:", eventId);
      eventIds.push(eventId);
    } else {
      // Create new event
      const { data, error } = await supabase
        .from('calendar_events')
        .insert(eventData)
        .select('id')
        .single();

      if (error) {
        console.error('Error creating calendar event:', error);
        throw error;
      }

      console.log("Created new calendar event with ID:", data.id);
      eventIds.push(data.id);
    }
  }

  // Return single ID or array of IDs depending on input type
  return Array.isArray(date) ? eventIds : eventIds[0];
};

// Fetch all calendar events for a specific booking ID
export const fetchEventsByBookingId = async (bookingId: string) => {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('booking_id', bookingId);
    
  if (error) {
    console.error('Error fetching booking events:', error);
    throw error;
  }
  
  // Map database field names to frontend field names
  return data?.map(event => ({
    id: event.id,
    resourceId: event.resource_id,
    start: event.start_time,
    end: event.end_time,
    title: event.title,
    eventType: event.event_type,
    bookingId: event.booking_id
  })) || [];
};

// New function to get all dates of a specific type for a booking
export const fetchBookingDatesByType = async (bookingId: string, eventType: 'rig' | 'event' | 'rigDown'): Promise<string[]> => {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('start_time')
    .eq('booking_id', bookingId)
    .eq('event_type', eventType)
    .order('start_time', { ascending: true });
    
  if (error) {
    console.error(`Error fetching ${eventType} dates for booking ${bookingId}:`, error);
    throw error;
  }
  
  // Extract dates from start_time and format as YYYY-MM-DD
  return data?.map(event => {
    const date = new Date(event.start_time);
    return date.toISOString().split('T')[0];
  }) || [];
};

// Delete a specific calendar event for a booking
export const deleteBookingEvent = async (bookingId: string, eventType: 'rig' | 'event' | 'rigDown', date: string): Promise<void> => {
  // Convert date to start and end times (9 AM to 5 PM)
  const startDate = new Date(date);
  startDate.setHours(9, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(17, 0, 0, 0);

  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('booking_id', bookingId)
    .eq('event_type', eventType)
    .eq('start_time', startDate.toISOString())
    .eq('end_time', endDate.toISOString());
    
  if (error) {
    console.error(`Error deleting ${eventType} event for booking ${bookingId} on ${date}:`, error);
    throw error;
  }
  
  console.log(`Deleted ${eventType} event for booking ${bookingId} on ${date}`);
};

// Delete all calendar events for a booking
export const deleteAllBookingEvents = async (bookingId: string): Promise<void> => {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('booking_id', bookingId);
    
  if (error) {
    console.error(`Error deleting all events for booking ${bookingId}:`, error);
    throw error;
  }
  
  console.log(`Deleted all calendar events for booking ${bookingId}`);
};

// New function to manually resync a booking's calendar events - updated for case-insensitive comparison
export const resyncBookingToCalendar = async (bookingId: string): Promise<boolean> => {
  try {
    // First, get the booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    
    if (bookingError || !booking) {
      console.error(`Error fetching booking ${bookingId}:`, bookingError);
      return false;
    }
    
    // Only create calendar events if the status is confirmed (case insensitive)
    if (booking.status.toUpperCase() !== 'CONFIRMED') {
      console.log(`Booking ${bookingId} is not confirmed (status: ${booking.status}), skipping calendar sync`);
      return false;
    }
    
    // First remove any existing calendar events
    await deleteAllBookingEvents(bookingId);
    
    // Create events for each date type if available
    let eventsCreated = 0;
    
    // Format the delivery address for the event
    const deliveryAddress = booking.deliveryaddress 
      ? `${booking.deliveryaddress}, ${booking.delivery_city || ''} ${booking.delivery_postal_code || ''}`
      : 'No address provided';
    
    // Rig day dates
    if (booking.rigdaydate) {
      await syncBookingEvents(bookingId, 'rig', booking.rigdaydate, 'auto', booking.client, deliveryAddress);
      eventsCreated++;
    }
    
    // Event dates
    if (booking.eventdate) {
      await syncBookingEvents(bookingId, 'event', booking.eventdate, 'auto', booking.client, deliveryAddress);
      eventsCreated++;
    }
    
    // Rig down dates
    if (booking.rigdowndate) {
      await syncBookingEvents(bookingId, 'rigDown', booking.rigdowndate, 'auto', booking.client, deliveryAddress);
      eventsCreated++;
    }
    
    console.log(`Successfully resynced ${eventsCreated} calendar events for booking ${bookingId}`);
    return true;
    
  } catch (error) {
    console.error(`Error resyncing booking ${bookingId} to calendar:`, error);
    return false;
  }
};
