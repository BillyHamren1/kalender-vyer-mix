
import { supabase } from "@/integrations/supabase/client";
import { addCalendarEvent, deleteCalendarEvent, fetchEventsByBookingId } from './eventService';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

// Enhanced sync function that respects existing events
export const resyncBookingToCalendar = async (bookingId: string, force: boolean = false): Promise<boolean> => {
  console.log(`Resyncing booking ${bookingId} to calendar (force: ${force})`);
  
  try {
    // Get the booking data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError) {
      console.error('Error fetching booking:', bookingError);
      return false;
    }

    if (!booking || booking.status !== 'CONFIRMED') {
      console.log(`Booking ${bookingId} is not confirmed, skipping calendar sync`);
      return false;
    }

    // Check if events already exist (unless force is true)
    if (!force) {
      const { data: existingEvents, error: checkError } = await supabase
        .from('calendar_events')
        .select('id, event_type')
        .eq('booking_id', bookingId);

      if (checkError) {
        console.error('Error checking existing events:', checkError);
        return false;
      }

      if (existingEvents && existingEvents.length > 0) {
        console.log(`Booking ${bookingId} already has ${existingEvents.length} calendar events - skipping to prevent duplicates`);
        return true; // Return true because events exist
      }
    }

    console.log(`Creating calendar events for booking ${bookingId}...`);
    let eventsCreated = 0;

    // Create rig day event if date is provided
    if (booking.rigdaydate) {
      const rigEvent: Omit<CalendarEvent, 'id'> = {
        title: `Rig Day - ${booking.client}`,
        start: `${booking.rigdaydate}T08:00:00`,
        end: `${booking.rigdaydate}T12:00:00`,
        resourceId: 'team-1',
        eventType: 'rig',
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      };

      await addCalendarEvent(rigEvent);
      eventsCreated++;
      console.log(`Created rig event for booking ${bookingId}`);
    }

    // Create event day event if date is provided
    if (booking.eventdate) {
      const eventEvent: Omit<CalendarEvent, 'id'> = {
        title: `Event - ${booking.client}`,
        start: `${booking.eventdate}T08:00:00`,
        end: `${booking.eventdate}T11:00:00`,
        resourceId: 'team-6',
        eventType: 'event',
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      };

      await addCalendarEvent(eventEvent);
      eventsCreated++;
      console.log(`Created event for booking ${bookingId}`);
    }

    // Create rig down event if date is provided
    if (booking.rigdowndate) {
      const rigDownEvent: Omit<CalendarEvent, 'id'> = {
        title: `Rig Down - ${booking.client}`,
        start: `${booking.rigdowndate}T08:00:00`,
        end: `${booking.rigdowndate}T12:00:00`,
        resourceId: 'team-1',
        eventType: 'rigDown',
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      };

      await addCalendarEvent(rigDownEvent);
      eventsCreated++;
      console.log(`Created rig down event for booking ${bookingId}`);
    }

    // Update the last_calendar_sync timestamp
    if (eventsCreated > 0) {
      await supabase
        .from('bookings')
        .update({ last_calendar_sync: new Date().toISOString() })
        .eq('id', bookingId);
      
      console.log(`Successfully created ${eventsCreated} calendar events for booking ${bookingId}`);
    }

    return eventsCreated > 0;

  } catch (error) {
    console.error(`Error syncing booking ${bookingId} to calendar:`, error);
    return false;
  }
};

// Delete all calendar events for a booking
export const deleteAllBookingEvents = async (bookingId: string): Promise<void> => {
  console.log(`Deleting all calendar events for booking ${bookingId}`);
  
  try {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('booking_id', bookingId);

    if (error) {
      console.error('Error deleting booking events:', error);
      throw error;
    }

    console.log(`Successfully deleted calendar events for booking ${bookingId}`);
  } catch (error) {
    console.error(`Error deleting events for booking ${bookingId}:`, error);
    throw error;
  }
};

// Smart update function that only syncs when necessary
export const smartUpdateBookingCalendar = async (
  bookingId: string, 
  oldData: any, 
  newData: any
): Promise<void> => {
  console.log(`Smart update for booking ${bookingId}`, { oldData, newData });

  // Check if this requires calendar sync
  const needsCalendarSync = shouldSyncToCalendar(oldData, newData);
  
  if (!needsCalendarSync) {
    console.log(`No calendar sync needed for booking ${bookingId} - only updating booking data`);
    return;
  }

  console.log(`Calendar sync needed for booking ${bookingId} - updating events`);

  // If status changed to CONFIRMED, create events
  if (newData.status === 'CONFIRMED' && oldData.status !== 'CONFIRMED') {
    await resyncBookingToCalendar(bookingId);
    return;
  }

  // If status changed from CONFIRMED to something else, remove events
  if (oldData.status === 'CONFIRMED' && newData.status !== 'CONFIRMED') {
    await deleteAllBookingEvents(bookingId);
    return;
  }

  // If dates changed on a confirmed booking, update events
  if (newData.status === 'CONFIRMED' && (
    oldData.rigdaydate !== newData.rigdaydate ||
    oldData.eventdate !== newData.eventdate ||
    oldData.rigdowndate !== newData.rigdowndate
  )) {
    console.log(`Dates changed for confirmed booking ${bookingId} - recreating events`);
    await deleteAllBookingEvents(bookingId);
    await resyncBookingToCalendar(bookingId);
    return;
  }
};

// Determine if a booking update requires calendar synchronization
const shouldSyncToCalendar = (oldData: any, newData: any): boolean => {
  // Status change to/from CONFIRMED always requires sync
  if (oldData.status !== newData.status) {
    return newData.status === 'CONFIRMED' || oldData.status === 'CONFIRMED';
  }

  // Date changes on confirmed bookings require sync
  if (newData.status === 'CONFIRMED') {
    return (
      oldData.rigdaydate !== newData.rigdaydate ||
      oldData.eventdate !== newData.eventdate ||
      oldData.rigdowndate !== newData.rigdowndate
    );
  }

  // No other changes require calendar sync
  return false;
};

// Legacy function for backward compatibility
export const syncBookingEvents = async (bookingId: string): Promise<void> => {
  console.log(`Legacy syncBookingEvents called for ${bookingId} - redirecting to resyncBookingToCalendar`);
  await resyncBookingToCalendar(bookingId);
};
