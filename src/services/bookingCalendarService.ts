
import { supabase } from "@/integrations/supabase/client";
import { addCalendarEvent, deleteCalendarEvent } from './eventService';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { format } from 'date-fns';
import { 
  syncBookingToWarehouseCalendar, 
  removeWarehouseEventsForBooking,
  checkAndMarkWarehouseChanges 
} from './warehouseCalendarService';

const normalizeStatus = (status: unknown) => {
  const normalized = (status ?? '').toString().trim().toUpperCase();

  // Normalize common Swedish/legacy values into our canonical set
  if (normalized === 'BEKRÄFTAD') return 'CONFIRMED';
  if (normalized === 'AVBOKAD') return 'CANCELLED';

  return normalized;
};

// Smart update that only changes calendar when booking changes affect calendar events
export const smartUpdateBookingCalendar = async (
  bookingId: string, 
  oldBooking: any, 
  newBooking: any
): Promise<void> => {
  console.log(`SmartUpdateBookingCalendar: Processing booking ${bookingId}`);
  
  try {
    const oldStatus = normalizeStatus(oldBooking?.status);
    const newStatus = normalizeStatus(newBooking?.status);

    // Handle booking deletion
    if (newStatus === 'DELETED') {
      await removeAllBookingEvents(bookingId);
      console.log(`Removed all calendar events for deleted booking ${bookingId}`);
      return;
    }

    // If booking was confirmed but now isn't, remove all events
    if (oldStatus === 'CONFIRMED' && newStatus !== 'CONFIRMED') {
      await removeAllBookingEvents(bookingId);
      console.log(`Removed calendar events for booking ${bookingId} - status changed from CONFIRMED`);
      return;
    }

    // If booking is now confirmed but wasn't before, create all events
    if (oldStatus !== 'CONFIRMED' && newStatus === 'CONFIRMED') {
      await syncSingleBookingToCalendar(bookingId, newBooking);
      console.log(`Created calendar events for newly confirmed booking ${bookingId}`);
      return;
    }

    // If booking is confirmed and dates changed, update calendar events
    if (newStatus === 'CONFIRMED') {
      const dateFields = ['rigdaydate', 'eventdate', 'rigdowndate'];
      const timeFields = ['rig_start_time', 'rig_end_time', 'event_start_time', 'event_end_time', 'rigdown_start_time', 'rigdown_end_time'];
      
      const datesChanged = dateFields.some(field => oldBooking[field] !== newBooking[field]);
      const timesChanged = timeFields.some(field => oldBooking[field] !== newBooking[field]);
      
      if (datesChanged || timesChanged) {
        console.log(`Dates or times changed for confirmed booking ${bookingId}, updating calendar`);
        await removeAllBookingEvents(bookingId);
        await syncSingleBookingToCalendar(bookingId, newBooking);
        
        // Check and mark warehouse events as changed (don't auto-update, just flag)
        await checkAndMarkWarehouseChanges(
          bookingId,
          newBooking.rigdaydate,
          newBooking.rigdowndate,
          newBooking.eventdate
        );
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

    // Also remove warehouse events
    await removeWarehouseEventsForBooking(bookingId);

    console.log(`Successfully removed all calendar events for booking ${bookingId}`);
  } catch (error) {
    console.error(`Error removing events for booking ${bookingId}:`, error);
    throw error;
  }
};

// Sync a single confirmed booking to calendar events
export const syncSingleBookingToCalendar = async (bookingId: string, booking?: any): Promise<void> => {
  console.log(`🔄 [syncSingleBookingToCalendar] Starting sync for booking ${bookingId}`);
  
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
    
    console.log(`📋 [syncSingleBookingToCalendar] Booking data:`, {
      id: booking.id,
      client: booking.client,
      status: booking.status,
      rig_start_time: booking.rig_start_time,
      rig_end_time: booking.rig_end_time,
      event_start_time: booking.event_start_time,
      event_end_time: booking.event_end_time,
      rigdown_start_time: booking.rigdown_start_time,
      rigdown_end_time: booking.rigdown_end_time
    });

    if (booking.status !== 'CONFIRMED') {
      console.log(`⏭️ [syncSingleBookingToCalendar] Booking ${bookingId} is not confirmed (status: ${booking.status}), skipping sync`);
      return;
    }

    // Check if events already exist for this booking
    const { data: existingEvents, error: checkError } = await supabase
      .from('calendar_events')
      .select('id, event_type, start_time, end_time')
      .eq('booking_id', bookingId);

    if (checkError) {
      console.error('Error checking existing events:', checkError);
      throw checkError;
    }

    // Build map of existing events by type
    const existingEventMap = new Map(
      existingEvents?.map(e => [e.event_type, e]) || []
    );

    // Process each date type and UPDATE or CREATE as needed
    const processEventType = async (
      dateField: string | null,
      startTimeField: string | null,
      endTimeField: string | null,
      eventType: 'rig' | 'event' | 'rigDown',
      title: string,
      resourceId: string
    ) => {
      if (!dateField) return;

      // CRITICAL: Use actual times from booking, with proper defaults
      // These times should already be in ISO format from the database
      const startTime = startTimeField || `${dateField}T08:00:00`;
      const endTime = endTimeField || `${dateField}T14:00:00`;
      
      console.log(`📅 [syncSingleBookingToCalendar] ${eventType} times:`, {
        bookingId: booking.id,
        startTimeField,
        endTimeField,
        finalStartTime: startTime,
        finalEndTime: endTime
      });

      const eventData = {
        title,
        start_time: startTime,
        end_time: endTime,
        resource_id: resourceId,
        event_type: eventType,
        booking_id: booking.id,
        booking_number: booking.booking_number || booking.id,
        delivery_address: [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || 'No address provided'
      };

      const existingEvent = existingEventMap.get(eventType);

      if (existingEvent) {
        // UPDATE existing event to preserve manual edits
        console.log(`Updating existing ${eventType} event for booking ${bookingId}`);
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update({
            title: eventData.title,
            start_time: eventData.start_time,
            end_time: eventData.end_time,
            resource_id: eventData.resource_id,
            booking_number: eventData.booking_number,
            delivery_address: eventData.delivery_address
          })
          .eq('id', existingEvent.id);

        if (updateError) {
          console.error(`Error updating ${eventType} event:`, updateError);
          throw updateError;
        }
      } else {
        // CREATE new event
        console.log(`Creating new ${eventType} event for booking ${bookingId}`);
        const { error: insertError } = await supabase
          .from('calendar_events')
          .insert([eventData]);

        if (insertError) {
          console.error(`Error creating ${eventType} event:`, insertError);
          throw insertError;
        }
      }
    };

    // Process each event type
    await processEventType(
      booking.rigdaydate,
      booking.rig_start_time,
      booking.rig_end_time,
      'rig',
      booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
      'team-1'
    );

    await processEventType(
      booking.eventdate,
      booking.event_start_time,
      booking.event_end_time,
      'event',
      booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
      'team-11'
    );

    await processEventType(
      booking.rigdowndate,
      booking.rigdown_start_time,
      booking.rigdown_end_time,
      'rigDown',
      booking.booking_number ? `${booking.booking_number}: ${booking.client}` : booking.client,
      'team-1'
    );

    // Delete any events that no longer have corresponding dates in the booking
    const validEventTypes = new Set<string>();
    if (booking.rigdaydate) validEventTypes.add('rig');
    if (booking.eventdate) validEventTypes.add('event');
    if (booking.rigdowndate) validEventTypes.add('rigDown');

    for (const [eventType, existingEvent] of existingEventMap) {
      if (!validEventTypes.has(eventType)) {
        console.log(`Removing obsolete ${eventType} event for booking ${bookingId}`);
        await supabase
          .from('calendar_events')
          .delete()
          .eq('id', existingEvent.id);
      }
    }

    // Sync to warehouse calendar
    try {
      await syncBookingToWarehouseCalendar(booking);
      console.log(`Successfully synced booking ${bookingId} to warehouse calendar`);
    } catch (warehouseError) {
      console.error(`Error syncing to warehouse calendar:`, warehouseError);
      // Don't throw - warehouse sync failure shouldn't block main calendar sync
    }

    console.log(`Successfully synced events for booking ${bookingId}`);

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
