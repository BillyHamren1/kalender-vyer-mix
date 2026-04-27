import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers a sync from booking → packing_projects via Edge Function.
 * This ensures packing list items are also synced (the DB trigger only handles name/status).
 *
 * Safe to call on any booking change - the Edge Function is idempotent.
 *
 * @param opts.throwOnError When true, errors propagate so the caller can block on
 *   a complete sync (used by the official inbox→packing pipeline). When false
 *   (default, legacy behavior), errors are swallowed for fire-and-forget syncs
 *   from booking edits where partial sync is acceptable.
 */
export const syncBookingToPacking = async (
  bookingId: string,
  organizationId: string,
  opts: { throwOnError?: boolean; targetPackingId?: string } = {}
): Promise<void> => {
  try {
    console.log(
      `[syncBookingToPacking] Triggering sync for booking ${bookingId}` +
        (opts.targetPackingId ? ` → target packing ${opts.targetPackingId}` : '')
    );

    const { data, error } = await supabase.functions.invoke('sync-booking-to-packing', {
      body: {
        booking_id: bookingId,
        organization_id: organizationId,
        ...(opts.targetPackingId ? { target_packing_id: opts.targetPackingId } : {}),
      }
    });

    if (error) {
      console.error('[syncBookingToPacking] Edge Function error:', error);
      if (opts.throwOnError) {
        throw new Error(`syncBookingToPacking failed: ${error.message || error}`);
      }
      return;
    }

    console.log('[syncBookingToPacking] Sync result:', data);
  } catch (err) {
    console.error('[syncBookingToPacking] Unexpected error:', err);
    if (opts.throwOnError) throw err;
  }
};
