
import { supabase } from "@/integrations/supabase/client";
import { addCalendarEvent, deleteCalendarEvent } from './eventService';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { format } from 'date-fns';

// Smart update that only changes calendar when booking changes affect calendar events
export const smartUpdateBookingCalendar = async (
  bookingId: string, 
  oldBooking: any, 
  newBooking: any
): Promise<void> => {
  console.log(`SmartUpdateBookingCalendar: Processing booking ${bookingId}`);
  
  try {
    // Handle booking deletion
    if (newBooking.status === 'DELETED') {
      await removeAllBookingEvents(bookingId);
      console.log(`Removed all calendar events for deleted booking ${bookingId}`);
      return;
    }

    // If booking was confirmed but now isn't, remove all events
    if (oldBooking.status === 'CONFIRMED' && newBooking.status !== 'CONFIRMED') {
      await removeAllBookingEvents(bookingId);
      console.log(`Removed calendar events for booking ${bookingId} - status changed from CONFIRMED`);
      return;
    }

    // If booking is now confirmed but wasn't before, create all events
    if (oldBooking.status !== 'CONFIRMED' && newBooking.status === 'CONFIRMED') {
      await syncSingleBookingToCalendar(bookingId, newBooking);
      console.log(`Created calendar events for newly confirmed booking ${bookingId}`);
      return;
    }

    // If booking is confirmed and dates changed, update calendar events
    if (newBooking.status === 'CONFIRMED') {
      const dateFields = ['rigdaydate', 'eventdate', 'rigdowndate'];
      const timeFields = ['rig_start_time', 'rig_end_time', 'event_start_time', 'event_end_time', 'rigdown_start_time', 'rigdown_end_time'];
      
      const datesChanged = dateFields.some(field => oldBooking[field] !== newBooking[field]);
      const timesChanged = timeFields.some(field => oldBooking[field] !== newBooking[field]);
      
      if (datesChanged || timesChanged) {
        console.log(`Dates or times changed for confirmed booking ${bookingId}, updating calendar`);
        await removeAllBookingEvents(bookingId);
        await syncSingleBookingToCalendar(bookingId, newBooking);
      }
    }
  } catch (error) {
    console.error(`Error in smartUpdateBookingCalendar for booking ${bookingId}:`, error);
    throw error;
  }
};

// Remove all calendar events for a booking
export const removeAllBookingEvents = async (bookingId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('booking_id', bookingId);

    if (error) {
      console.error('Error removing booking events:', error);
      throw error;
    }

    console.log(`Successfully removed all calendar events for booking ${bookingId}`);
  } catch (error) {
    console.error(`Error removing events for booking ${bookingId}:`, error);
    throw error;
  }
};

// Sync a single confirmed booking to calendar events
export const syncSingleBookingToCalendar = async (bookingId: string, booking?: any): Promise<void> => {
  console.log(`Syncing booking ${bookingId} to calendar...`);
  
  try {
    // Fetch booking if not provided
    if (!booking) {
      const { data: fetchedBooking, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      if (bookingError) {
        console.error('Error fetching booking:', bookingError);
        throw bookingError;
      }
      booking = fetchedBooking;
    }

    if (booking.status !== 'CONFIRMED') {
      console.log(`Booking ${bookingId} is not confirmed, skipping sync`);
      return;
    }

    // Check if events already exist for this booking
    const { data: existingEvents, error: checkError } = await supabase
      .from('calendar_events')
      .select('id, event_type')
      .eq('booking_id', bookingId);

    if (checkError) {
      console.error('Error checking existing events:', checkError);
      throw checkError;
    }

    if (existingEvents && existingEvents.length > 0) {
      console.log(`Booking ${bookingId} already has ${existingEvents.length} calendar events - updating them`);
      // Remove existing events first, then recreate
      await removeAllBookingEvents(bookingId);
    }

    // Create events for each date with proper times
    const eventsToCreate = [];

    if (booking.rigdaydate) {
      const rigStartTime = booking.rig_start_time || `${booking.rigdaydate}T08:00:00`;
      const rigEndTime = booking.rig_end_time || `${booking.rigdaydate}T12:00:00`;
      
      eventsToCreate.push({
        title: `Rig Day - ${booking.client}`,
        start: rigStartTime,
        end: rigEndTime,
        resourceId: 'team-1',
        eventType: 'rig' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.eventdate) {
      const eventStartTime = booking.event_start_time || `${booking.eventdate}T08:00:00`;
      const eventEndTime = booking.event_end_time || `${booking.eventdate}T11:00:00`;
      
      eventsToCreate.push({
        title: `Event - ${booking.client}`,
        start: eventStartTime,
        end: eventEndTime,
        resourceId: 'team-6', // Events go to team-6
        eventType: 'event' as const,
        bookingId: booking.id,
        bookingNumber: booking.booking_number || booking.id,
        deliveryAddress: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      });
    }

    if (booking.rigdowndate) {
      const rigdownStartTime = booking.rigdown_start_time || `${booking.rigdowndate}T08:00:00`;
      const rigdownEndTime = booking.rigdown_end_time || `${booking.rigdowndate}T12:00:00`;
      
      eventsToCreate.push({
        title: `Rig Down - ${booking.client}`,
        start: rigdownStartTime,
        end: rigdownEndTime,
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

    console.log(`Successfully synced ${eventsToCreate.length} events for booking ${bookingId}`);

  } catch (error) {
    console.error(`Error syncing booking ${bookingId}:`, error);
    throw error;
  }
};

// Force sync all confirmed bookings to calendar
export const forceFullBookingSync = async (): Promise<number> => {
  console.log('Starting full booking sync to calendar...');
  
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

    console.log(`Found ${confirmedBookings?.length || 0} confirmed bookings to sync`);

    if (!confirmedBookings || confirmedBookings.length === 0) {
      return 0;
    }

    let eventsCreated = 0;

    for (const booking of confirmedBookings) {
      try {
        await syncSingleBookingToCalendar(booking.id, booking);
        eventsCreated++;
      } catch (error) {
        console.error(`Failed to sync booking ${booking.id}:`, error);
      }
    }

    console.log(`Full booking sync completed. Synced ${eventsCreated} bookings.`);
    return eventsCreated;

  } catch (error) {
    console.error('Error in full booking sync:', error);
    throw error;
  }
};

// Get booking dates by type from calendar events
export const fetchBookingDatesByType = async (
  bookingId: string, 
  eventType: 'rig' | 'event' | 'rigDown'
): Promise<string[]> => {
  try {
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('start_time')
      .eq('booking_id', bookingId)
      .eq('event_type', eventType);

    if (error) {
      console.error(`Error fetching ${eventType} dates for booking ${bookingId}:`, error);
      throw error;
    }

    // Extract unique dates
    const dates = events?.map(event => format(new Date(event.start_time), 'yyyy-MM-dd')) || [];
    return [...new Set(dates)]; // Remove duplicates
  } catch (error) {
    console.error(`Error in fetchBookingDatesByType:`, error);
    return [];
  }
};
