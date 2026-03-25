import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers a sync from booking → packing_projects via Edge Function.
 * This ensures packing list items are also synced (the DB trigger only handles name/status).
 * 
 * Safe to call on any booking change - the Edge Function is idempotent.
 */
export const syncBookingToPacking = async (
  bookingId: string,
  organizationId: string
): Promise<void> => {
  try {
    console.log(`[syncBookingToPacking] Triggering sync for booking ${bookingId}`);
    
    const { data, error } = await supabase.functions.invoke('sync-booking-to-packing', {
      body: {
        booking_id: bookingId,
        organization_id: organizationId
      }
    });

    if (error) {
      console.error('[syncBookingToPacking] Edge Function error:', error);
      // Non-blocking - don't throw, packing sync is secondary
      return;
    }

    console.log('[syncBookingToPacking] Sync result:', data);
  } catch (err) {
    console.error('[syncBookingToPacking] Unexpected error:', err);
    // Non-blocking
  }
};
