
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
