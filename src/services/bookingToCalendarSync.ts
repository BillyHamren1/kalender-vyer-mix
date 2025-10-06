
import { supabase } from "@/integrations/supabase/client";
import { addCalendarEvent } from './eventService';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

// Sync confirmed bookings to calendar events
export const syncConfirmedBookingsToCalendar = async (): Promise<number> => {
  console.log('Starting sync of confirmed bookings to calendar...');
  
  try {
    // Get all confirmed bookings
    const { data: confirmedBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'CONFIRMED');

    if (bookingError) {
      console.error('Error fetching confirmed bookings:', bookingError);
      throw bookingError;
    }

    console.log(`Found ${confirmedBookings?.length || 0} confirmed bookings`);

    if (!confirmedBookings || confirmedBookings.length === 0) {
      return 0;
    }

    let eventsCreated = 0;

    for (const booking of confirmedBookings) {
      // CRITICAL: Check if ANY events already exist for this booking - if so, skip entirely
      const { data: existingEvents, error: checkError } = await supabase
        .from('calendar_events')
        .select('id, event_type, booking_id')
        .eq('booking_id', booking.id);

      if (checkError) {
        console.error('Error checking existing events for booking:', booking.id, checkError);
        continue;
      }

      if (existingEvents && existingEvents.length > 0) {
        console.log(`Booking ${booking.id} already has ${existingEvents.length} calendar events - SKIPPING to prevent duplicates`);
        continue; // Skip this booking entirely - it's already been planned
      }

      console.log(`Booking ${booking.id} has no existing events - proceeding with sync`);

      // Create rig day event if date is provided - DEFAULT 4 HOURS
      if (booking.rigdaydate) {
        const rigEvent: Omit<CalendarEvent, 'id'> = {
          title: booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
          start: `${booking.rigdaydate}T08:00:00`,
          end: `${booking.rigdaydate}T12:00:00`,
          resourceId: 'team-1', // Default to Team 1, can be moved later
          eventType: 'rig',
          bookingId: booking.id,
          bookingNumber: booking.booking_number || booking.id,
          deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
        };

        await addCalendarEvent(rigEvent);
        eventsCreated++;
        console.log(`Created rig event for booking ${booking.id}`);
      }

      // Create event day event if date is provided - DEFAULT 3 HOURS (goes to LIVE column)
      if (booking.eventdate) {
        const eventEvent: Omit<CalendarEvent, 'id'> = {
          title: booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
          start: `${booking.eventdate}T08:00:00`,
          end: `${booking.eventdate}T11:00:00`, // 3 hours for EVENT type
          resourceId: 'team-11', // LIVE column
          eventType: 'event',
          bookingId: booking.id,
          bookingNumber: booking.booking_number || booking.id,
          deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
        };

        await addCalendarEvent(eventEvent);
        eventsCreated++;
        console.log(`Created event for booking ${booking.id}`);
      }

      // Create rig down event if date is provided - DEFAULT 4 HOURS
      if (booking.rigdowndate) {
        const rigDownEvent: Omit<CalendarEvent, 'id'> = {
          title: booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
          start: `${booking.rigdowndate}T08:00:00`,
          end: `${booking.rigdowndate}T12:00:00`,
          resourceId: 'team-1', // Default to Team 1, can be moved later
          eventType: 'rigDown',
          bookingId: booking.id,
          bookingNumber: booking.booking_number || booking.id,
          deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
        };

        await addCalendarEvent(rigDownEvent);
        eventsCreated++;
        console.log(`Created rig down event for booking ${booking.id}`);
      }
    }

    console.log(`Booking sync completed. Created ${eventsCreated} calendar events.`);
    return eventsCreated;

  } catch (error) {
    console.error('Error in booking sync:', error);
    throw error;
  }
};

// Sync a single booking to calendar events (when a booking is confirmed)
export const syncSingleBookingToCalendar = async (bookingId: string): Promise<void> => {
  console.log(`Syncing single booking ${bookingId} to calendar...`);
  
  try {
    // Get the specific booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError) {
      console.error('Error fetching booking:', bookingError);
      throw bookingError;
    }

    if (booking.status !== 'CONFIRMED') {
      console.log(`Booking ${bookingId} is not confirmed, skipping sync`);
      return;
    }

    // CRITICAL: Check if ANY events already exist for this booking - if so, don't create new ones
    const { data: existingEvents, error: checkError } = await supabase
      .from('calendar_events')
      .select('id, event_type, booking_id')
      .eq('booking_id', bookingId);

    if (checkError) {
      console.error('Error checking existing events:', checkError);
      throw checkError;
    }

    if (existingEvents && existingEvents.length > 0) {
      console.log(`Booking ${bookingId} already has ${existingEvents.length} calendar events - CANNOT plan again`);
      return; // Exit - this booking is already planned
    }

    console.log(`Booking ${bookingId} has no existing events - proceeding with planning`);

    // Create events for each date
    const eventsToCreate = [];

    if (booking.rigdaydate) {
      eventsToCreate.push({
        title: booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
        start: `${booking.rigdaydate}T08:00:00`,
        end: `${booking.rigdaydate}T12:00:00`, // 4 hours for rig
        resourceId: 'team-1',
        eventType: 'rig' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.eventdate) {
      eventsToCreate.push({
        title: booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
        start: `${booking.eventdate}T08:00:00`,
        end: `${booking.eventdate}T11:00:00`, // 3 hours for EVENT type
        resourceId: 'team-11', // LIVE column
        eventType: 'event' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.rigdowndate) {
      eventsToCreate.push({
        title: booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
        start: `${booking.rigdowndate}T08:00:00`,
        end: `${booking.rigdowndate}T12:00:00`, // 4 hours for rig down
        resourceId: 'team-1',
        eventType: 'rigDown' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    // Create all events
    for (const eventData of eventsToCreate) {
      await addCalendarEvent(eventData);
      console.log(`Created ${eventData.eventType} event for booking ${bookingId}`);
    }

  } catch (error) {
    console.error(`Error syncing booking ${bookingId}:`, error);
    throw error;
  }
};

// Remove calendar events for a booking (when status changes from CONFIRMED to something else)
export const removeBookingEventsFromCalendar = async (bookingId: string): Promise<void> => {
  console.log(`Removing calendar events for booking ${bookingId}...`);
  
  try {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('booking_id', bookingId);

    if (error) {
      console.error('Error removing booking events:', error);
      throw error;
    }

    console.log(`Successfully removed calendar events for booking ${bookingId}`);
  } catch (error) {
    console.error(`Error removing events for booking ${bookingId}:`, error);
    throw error;
  }
};
