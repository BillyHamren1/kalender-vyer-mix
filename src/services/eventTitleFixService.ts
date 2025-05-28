
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Helper function to generate user-friendly event titles
const generateEventTitle = (booking: any): string => {
  if (booking.booking_number) {
    return `${booking.booking_number}: ${booking.client}`;
  }
  // If no booking number, just use client name
  return booking.client;
};

// Function to fix existing calendar event titles
export const fixAllEventTitles = async (): Promise<{ updated: number; errors: number }> => {
  console.log('Starting to fix existing calendar event titles...');
  
  try {
    // Get all calendar events with their booking data
    const { data: events, error: fetchError } = await supabase
      .from('calendar_events')
      .select(`
        id,
        title,
        booking_id,
        bookings!calendar_events_booking_id_fkey (
          id,
          client,
          booking_number
        )
      `)
      .not('booking_id', 'is', null);

    if (fetchError) {
      console.error('Error fetching events for title fix:', fetchError);
      throw fetchError;
    }

    if (!events || events.length === 0) {
      console.log('No events found to fix');
      toast.info('No events found to update');
      return { updated: 0, errors: 0 };
    }

    console.log(`Found ${events.length} events to check`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const event of events) {
      const booking = event.bookings;
      if (!booking) {
        console.warn(`Event ${event.id} has no booking data`);
        continue;
      }

      const correctTitle = generateEventTitle(booking);
      
      // Only update if the title is different (i.e., currently showing UUID or wrong format)
      if (event.title !== correctTitle) {
        try {
          const { error: updateError } = await supabase
            .from('calendar_events')
            .update({ title: correctTitle })
            .eq('id', event.id);

          if (updateError) {
            console.error(`Error updating event ${event.id}:`, updateError);
            errorCount++;
          } else {
            console.log(`Updated event ${event.id} from "${event.title}" to "${correctTitle}"`);
            updatedCount++;
          }
        } catch (error) {
          console.error(`Exception updating event ${event.id}:`, error);
          errorCount++;
        }
      }
    }

    const message = `Updated ${updatedCount} event titles${errorCount > 0 ? ` (${errorCount} errors)` : ''}`;
    console.log(message);
    
    if (updatedCount > 0) {
      toast.success(message);
    } else {
      toast.info('All event titles are already correct');
    }

    return { updated: updatedCount, errors: errorCount };
  } catch (error) {
    console.error('Error in fixAllEventTitles:', error);
    toast.error('Failed to fix event titles');
    throw error;
  }
};
