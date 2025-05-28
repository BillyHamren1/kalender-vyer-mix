
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { format } from 'date-fns';

export const syncBookingEvents = async (): Promise<CalendarEvent[]> => {
  console.log('Starting booking event sync...');
  
  try {
    // Fetch all confirmed bookings with their products
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_products (
          id,
          name,
          quantity,
          notes
        )
      `)
      .eq('status', 'CONFIRMED')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings for sync:', error);
      throw error;
    }

    if (!bookings || bookings.length === 0) {
      console.log('No confirmed bookings found for sync');
      return [];
    }

    console.log(`Found ${bookings.length} confirmed bookings for sync`);

    const calendarEvents: CalendarEvent[] = [];

    for (const booking of bookings) {
      // Transform products data
      const products = booking.booking_products?.map((product: any) => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        notes: product.notes || undefined
      })) || [];

      // Create events for each date (rigdaydate, eventdate, rigdowndate)
      const dates = [
        { date: booking.rigdaydate, type: 'rigday', label: 'Rig Day' },
        { date: booking.eventdate, type: 'event', label: 'Event' },
        { date: booking.rigdowndate, type: 'rigdown', label: 'Rig Down' }
      ].filter(d => d.date); // Only include dates that exist

      for (const { date, type, label } of dates) {
        const eventId = `${booking.id}-${type}`;
        const eventTitle = `${booking.booking_number || booking.id}: ${booking.client}`;
        
        // Determine resource assignment based on event type
        let resourceId = 'unassigned';
        if (type === 'event') {
          resourceId = 'team-6'; // Today's events
        }

        const calendarEvent: CalendarEvent = {
          id: eventId,
          title: eventTitle,
          start: new Date(`${date}T08:00:00`),
          end: new Date(`${date}T18:00:00`),
          resourceId: resourceId,
          extendedProps: {
            bookingId: booking.id,
            bookingNumber: booking.booking_number,
            eventType: type,
            deliveryAddress: booking.deliveryaddress,
            deliveryCity: booking.delivery_city,
            deliveryPostalCode: booking.delivery_postal_code,
            internalNotes: booking.internalnotes,
            products: products, // Include products data
            carryMoreThan10m: booking.carry_more_than_10m,
            groundNailsAllowed: booking.ground_nails_allowed,
            exactTimeNeeded: booking.exact_time_needed,
            exactTimeInfo: booking.exact_time_info
          }
        };

        calendarEvents.push(calendarEvent);
      }
    }

    console.log(`Created ${calendarEvents.length} calendar events from bookings`);
    return calendarEvents;

  } catch (error) {
    console.error('Error in syncBookingEvents:', error);
    throw error;
  }
};

// Smart update function that handles calendar changes based on booking status and date changes
export const smartUpdateBookingCalendar = async (
  bookingId: string,
  oldBooking: any,
  newBooking: any
): Promise<void> => {
  console.log(`Smart calendar update for booking ${bookingId}`);
  
  try {
    // Handle status changes
    if (oldBooking.status === 'CONFIRMED' && newBooking.status !== 'CONFIRMED') {
      // Booking was confirmed but now isn't - remove from calendar
      await deleteAllBookingEvents(bookingId);
      return;
    }
    
    if (oldBooking.status !== 'CONFIRMED' && newBooking.status === 'CONFIRMED') {
      // Booking became confirmed - add to calendar
      await resyncBookingToCalendar(bookingId);
      return;
    }
    
    if (newBooking.status === 'CONFIRMED') {
      // Check if dates changed
      const datesChanged = (
        oldBooking.rigdaydate !== newBooking.rigdaydate ||
        oldBooking.eventdate !== newBooking.eventdate ||
        oldBooking.rigdowndate !== newBooking.rigdowndate
      );
      
      if (datesChanged) {
        // Dates changed - resync the booking
        await resyncBookingToCalendar(bookingId);
      }
    }
  } catch (error) {
    console.error('Error in smartUpdateBookingCalendar:', error);
    throw error;
  }
};

// Resync a specific booking to calendar
export const resyncBookingToCalendar = async (bookingId: string): Promise<void> => {
  console.log(`Resyncing booking ${bookingId} to calendar`);
  
  try {
    // First remove existing events for this booking
    await deleteAllBookingEvents(bookingId);
    
    // Get the booking data
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        *,
        booking_products (
          id,
          name,
          quantity,
          notes
        )
      `)
      .eq('id', bookingId)
      .single();

    if (error) {
      console.error('Error fetching booking for resync:', error);
      throw error;
    }

    if (!booking || booking.status !== 'CONFIRMED') {
      console.log(`Booking ${bookingId} not found or not confirmed`);
      return;
    }

    // Transform products data
    const products = booking.booking_products?.map((product: any) => ({
      id: product.id,
      name: product.name,
      quantity: product.quantity,
      notes: product.notes || undefined
    })) || [];

    // Create calendar events for each date
    const dates = [
      { date: booking.rigdaydate, type: 'rigday' },
      { date: booking.eventdate, type: 'event' },
      { date: booking.rigdowndate, type: 'rigdown' }
    ].filter(d => d.date);

    const eventsToInsert = [];

    for (const { date, type } of dates) {
      const eventId = `${booking.id}-${type}`;
      const eventTitle = `${booking.booking_number || booking.id}: ${booking.client}`;
      
      let resourceId = 'unassigned';
      if (type === 'event') {
        resourceId = 'team-6';
      }

      eventsToInsert.push({
        id: eventId,
        title: eventTitle,
        start_time: `${date}T08:00:00`,
        end_time: `${date}T18:00:00`,
        resource_id: resourceId,
        booking_id: booking.id,
        booking_number: booking.booking_number,
        event_type: type,
        delivery_address: booking.deliveryaddress
      });
    }

    if (eventsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('calendar_events')
        .upsert(eventsToInsert, { onConflict: 'id' });

      if (insertError) {
        console.error('Error inserting calendar events:', insertError);
        throw insertError;
      }

      console.log(`Successfully resynced ${eventsToInsert.length} events for booking ${bookingId}`);
    }
  } catch (error) {
    console.error('Error in resyncBookingToCalendar:', error);
    throw error;
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
      console.error('Error deleting calendar events:', error);
      throw error;
    }

    console.log(`Successfully deleted calendar events for booking ${bookingId}`);
  } catch (error) {
    console.error('Error in deleteAllBookingEvents:', error);
    throw error;
  }
};

// Fetch booking dates by type - returns array of dates for a booking
export const fetchBookingDatesByType = async (bookingId: string, dateType: string): Promise<string[]> => {
  console.log(`Fetching ${dateType} dates for booking ${bookingId}`);
  
  try {
    // Map dateType to actual database columns
    const columnMap: { [key: string]: string } = {
      'rig': 'rigdaydate',
      'event': 'eventdate',
      'rigDown': 'rigdowndate'
    };

    const column = columnMap[dateType] || dateType;

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(column)
      .eq('id', bookingId)
      .single();

    if (error) {
      console.error('Error fetching booking date:', error);
      throw error;
    }

    // Return array of dates (currently single date, but prepared for multiple dates)
    const dateValue = booking ? booking[column] : null;
    return dateValue ? [dateValue] : [];
  } catch (error) {
    console.error('Error in fetchBookingDatesByType:', error);
    throw error;
  }
};
