
import { supabase } from "@/integrations/supabase/client";
import { findAvailableTeam } from "./teamService";

// Create or update events for a booking date change
export const syncBookingEvents = async (
  bookingId: string,
  eventType: 'rig' | 'event' | 'rigDown',
  date: string,
  resourceId: string = 'auto',
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

  // If resourceId is 'auto', find an available team
  let teamId = resourceId;
  if (resourceId === 'auto') {
    teamId = await findAvailableTeam(startDate, endDate);
  }

  // Simplified title with no day text, just booking ID and client name
  const title = `${bookingId}: ${client}`;
  
  // Check the viewed status of the booking
  const { data: bookingData } = await supabase
    .from('bookings')
    .select('viewed')
    .eq('id', bookingId)
    .single();
  
  const isViewed = bookingData?.viewed || false;
  
  // Prepare the data to be saved
  const eventData = {
    resource_id: teamId,
    start_time: startDate.toISOString(),
    end_time: endDate.toISOString(),
    title: title,
    event_type: eventType,
    booking_id: bookingId,
    viewed: isViewed  // Add the viewed status to the event
  };

  console.log("Creating/updating calendar event:", eventData);

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
    return eventId;
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
    return data.id;
  }
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
    bookingId: event.booking_id,
    viewed: event.viewed || false // Add default false value if undefined
  })) || [];
};
