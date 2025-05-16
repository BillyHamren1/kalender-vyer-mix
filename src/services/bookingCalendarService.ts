
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
  
  // Prepare the data to be saved
  const eventData = {
    resource_id: teamId,
    start_time: startDate.toISOString(),
    end_time: endDate.toISOString(),
    title: title,
    event_type: eventType,
    booking_number: bookingId,
    customer: client
  };

  if (existingEvents && existingEvents.length > 0) {
    // Update existing event
    const eventId = existingEvents[0].id;
    await supabase
      .from('calendar_events')
      .update(eventData)
      .eq('id', eventId);
    
    return eventId;
  } else {
    // Create new event
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        ...eventData,
        booking_id: bookingId
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
