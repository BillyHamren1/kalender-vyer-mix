import { supabase } from "@/integrations/supabase/client";
import { addCalendarEvent } from './eventService';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

// Sync confirmed bookings to calendar events - STRENGTHENED DUPLICATE PREVENTION
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
          title: `Rig Day - ${booking.client}`,
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

      // Create event day event if date is provided - DEFAULT 3 HOURS (will be forced to team-6)
      if (booking.eventdate) {
        const eventEvent: Omit<CalendarEvent, 'id'> = {
          title: `Event - ${booking.client}`,
          start: `${booking.eventdate}T08:00:00`,
          end: `${booking.eventdate}T11:00:00`, // 3 hours for EVENT type
          resourceId: 'team-6', // Will be forced to team-6 anyway, but set it here
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
          title: `Rig Down - ${booking.client}`,
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

// Sync a single booking to calendar events - STRENGTHENED DUPLICATE PREVENTION
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
        title: `Rig Day - ${booking.client}`,
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
        title: `Event - ${booking.client}`,
        start: `${booking.eventdate}T08:00:00`,
        end: `${booking.eventdate}T11:00:00`, // 3 hours for EVENT type
        resourceId: 'team-6', // Will be forced to team-6 anyway
        eventType: 'event' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.rigdowndate) {
      eventsToCreate.push({
        title: `Rig Down - ${booking.client}`,
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

// Clean up duplicate calendar events - NEW FUNCTION
export const cleanupDuplicateCalendarEvents = async (): Promise<number> => {
  console.log('Starting cleanup of duplicate calendar events...');
  
  try {
    // Find all bookings with calendar events
    const { data: eventGroups, error } = await supabase
      .from('calendar_events')
      .select('booking_id, event_type, id, created_at')
      .not('booking_id', 'is', null)
      .order('booking_id')
      .order('event_type')
      .order('created_at');

    if (error) {
      console.error('Error fetching events for cleanup:', error);
      throw error;
    }

    if (!eventGroups || eventGroups.length === 0) {
      console.log('No events found for cleanup');
      return 0;
    }

    // Group events by booking_id and event_type
    const groupedEvents = eventGroups.reduce((acc, event) => {
      const key = `${event.booking_id}-${event.event_type}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    let deletedCount = 0;

    // For each group, keep only the oldest event and delete the rest
    for (const [key, events] of Object.entries(groupedEvents)) {
      if (events.length > 1) {
        // Sort by created_at to keep the oldest
        events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        // Keep the first (oldest) event, delete the rest
        const eventsToDelete = events.slice(1);
        const idsToDelete = eventsToDelete.map(e => e.id);
        
        console.log(`Found ${events.length} duplicate events for ${key}, keeping oldest, deleting ${idsToDelete.length}`);
        
        const { error: deleteError } = await supabase
          .from('calendar_events')
          .delete()
          .in('id', idsToDelete);

        if (deleteError) {
          console.error(`Error deleting duplicate events for ${key}:`, deleteError);
        } else {
          deletedCount += idsToDelete.length;
          console.log(`Deleted ${idsToDelete.length} duplicate events for ${key}`);
        }
      }
    }

    console.log(`Cleanup completed. Deleted ${deletedCount} duplicate calendar events.`);
    return deletedCount;

  } catch (error) {
    console.error('Error in cleanup:', error);
    throw error;
  }
};
