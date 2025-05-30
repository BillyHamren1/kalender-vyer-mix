
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from 'date-fns';

export interface BookingTimeUpdate {
  rigStartTime?: string;
  rigEndTime?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  rigdownStartTime?: string;
  rigdownEndTime?: string;
}

export const updateBookingTimes = async (
  bookingId: string,
  eventType: string,
  startTime: string,
  endTime: string
): Promise<void> => {
  console.log('Updating booking times with proper timezone handling:', { 
    bookingId, 
    eventType, 
    startTime, 
    endTime 
  });

  // Parse and validate the input times
  let parsedStart: Date;
  let parsedEnd: Date;
  
  try {
    parsedStart = parseISO(startTime);
    parsedEnd = parseISO(endTime);
    
    console.log('Parsed booking times:', {
      startLocal: format(parsedStart, 'yyyy-MM-dd HH:mm:ss'),
      endLocal: format(parsedEnd, 'yyyy-MM-dd HH:mm:ss'),
      startISO: parsedStart.toISOString(),
      endISO: parsedEnd.toISOString()
    });
  } catch (error) {
    console.error('Error parsing booking times:', error);
    throw new Error('Invalid time format provided');
  }

  // Map event types to the correct booking time columns
  const timeUpdate: BookingTimeUpdate = {};
  
  switch (eventType) {
    case 'rig':
      timeUpdate.rigStartTime = startTime;
      timeUpdate.rigEndTime = endTime;
      break;
    case 'event':
      timeUpdate.eventStartTime = startTime;
      timeUpdate.eventEndTime = endTime;
      break;
    case 'rigDown':
      timeUpdate.rigdownStartTime = startTime;
      timeUpdate.rigdownEndTime = endTime;
      break;
    default:
      console.warn(`Unknown event type: ${eventType}, skipping booking time update`);
      return;
  }

  // Convert to database column names with proper time formatting
  const dbUpdate: Record<string, string> = {};
  if (timeUpdate.rigStartTime) dbUpdate.rig_start_time = timeUpdate.rigStartTime;
  if (timeUpdate.rigEndTime) dbUpdate.rig_end_time = timeUpdate.rigEndTime;
  if (timeUpdate.eventStartTime) dbUpdate.event_start_time = timeUpdate.eventStartTime;
  if (timeUpdate.eventEndTime) dbUpdate.event_end_time = timeUpdate.eventEndTime;
  if (timeUpdate.rigdownStartTime) dbUpdate.rigdown_start_time = timeUpdate.rigdownStartTime;
  if (timeUpdate.rigdownEndTime) dbUpdate.rigdown_end_time = timeUpdate.rigdownEndTime;

  console.log('Database update payload:', dbUpdate);

  const { error } = await supabase
    .from('bookings')
    .update(dbUpdate)
    .eq('id', bookingId);

  if (error) {
    console.error('Error updating booking times:', error);
    throw error;
  }

  console.log('Successfully updated booking times for booking:', bookingId);
};
