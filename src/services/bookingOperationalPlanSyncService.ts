import { supabase } from '@/integrations/supabase/client';

/**
 * Rebuilds the canonical operational-plan projection for one booking and pushes it to Booking.
 * Best-effort from UI writes: a failed projection sync must never roll back Planning work.
 */
export async function syncBookingOperationalPlan(bookingId: string | null | undefined): Promise<void> {
  if (!bookingId) return;
  try {
    const { error } = await supabase.functions.invoke('sync-operational-plan-to-booking', {
      body: { booking_id: bookingId },
    });
    if (error) console.error('[operational-plan-sync] invoke failed', { bookingId, error });
  } catch (error) {
    console.error('[operational-plan-sync] unexpected failure', { bookingId, error });
  }
}
