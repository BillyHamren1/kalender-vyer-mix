
import { supabase } from "@/integrations/supabase/client";

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
  console.log('Updating booking times:', { bookingId, eventType, startTime, endTime });

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

  // Convert to database column names
  const dbUpdate: Record<string, string> = {};
  if (timeUpdate.rigStartTime) dbUpdate.rig_start_time = timeUpdate.rigStartTime;
  if (timeUpdate.rigEndTime) dbUpdate.rig_end_time = timeUpdate.rigEndTime;
  if (timeUpdate.eventStartTime) dbUpdate.event_start_time = timeUpdate.eventStartTime;
  if (timeUpdate.eventEndTime) dbUpdate.event_end_time = timeUpdate.eventEndTime;
  if (timeUpdate.rigdownStartTime) dbUpdate.rigdown_start_time = timeUpdate.rigdownStartTime;
  if (timeUpdate.rigdownEndTime) dbUpdate.rigdown_end_time = timeUpdate.rigdownEndTime;

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
