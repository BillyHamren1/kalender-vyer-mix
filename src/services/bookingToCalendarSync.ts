
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
      // Check if events already exist for this booking
      const { data: existingEvents } = await supabase
        .from('calendar_events')
        .select('id, event_type')
        .eq('booking_id', booking.id);

      const existingEventTypes = existingEvents?.map(e => e.event_type) || [];

      // Create rig day event if it doesn't exist and date is provided
      if (booking.rigdaydate && !existingEventTypes.includes('rig')) {
        const rigEvent: Omit<CalendarEvent, 'id'> = {
          title: `Rig Day - ${booking.client}`,
          start: `${booking.rigdaydate}T08:00:00`,
          end: `${booking.rigdaydate}T17:00:00`,
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

      // Create event day event if it doesn't exist and date is provided
      if (booking.eventdate && !existingEventTypes.includes('event')) {
        const eventEvent: Omit<CalendarEvent, 'id'> = {
          title: `Event - ${booking.client}`,
          start: `${booking.eventdate}T08:00:00`,
          end: `${booking.eventdate}T17:00:00`,
          resourceId: 'team-6', // Default to "Todays events" team
          eventType: 'event',
          bookingId: booking.id,
          bookingNumber: booking.booking_number || booking.id,
          deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
        };

        await addCalendarEvent(eventEvent);
        eventsCreated++;
        console.log(`Created event for booking ${booking.id}`);
      }

      // Create rig down event if it doesn't exist and date is provided
      if (booking.rigdowndate && !existingEventTypes.includes('rigDown')) {
        const rigDownEvent: Omit<CalendarEvent, 'id'> = {
          title: `Rig Down - ${booking.client}`,
          start: `${booking.rigdowndate}T08:00:00`,
          end: `${booking.rigdowndate}T17:00:00`,
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

    // Check if events already exist for this booking
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('id, event_type')
      .eq('booking_id', bookingId);

    const existingEventTypes = existingEvents?.map(e => e.event_type) || [];

    // Create events for each date that doesn't already have an event
    const eventsToCreate = [];

    if (booking.rigdaydate && !existingEventTypes.includes('rig')) {
      eventsToCreate.push({
        title: `Rig Day - ${booking.client}`,
        start: `${booking.rigdaydate}T08:00:00`,
        end: `${booking.rigdaydate}T17:00:00`,
        resourceId: 'team-1',
        eventType: 'rig' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.eventdate && !existingEventTypes.includes('event')) {
      eventsToCreate.push({
        title: `Event - ${booking.client}`,
        start: `${booking.eventdate}T08:00:00`,
        end: `${booking.eventdate}T17:00:00`,
        resourceId: 'team-6',
        eventType: 'event' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.rigdowndate && !existingEventTypes.includes('rigDown')) {
      eventsToCreate.push({
        title: `Rig Down - ${booking.client}`,
        start: `${booking.rigdowndate}T08:00:00`,
        end: `${booking.rigdowndate}T17:00:00`,
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
