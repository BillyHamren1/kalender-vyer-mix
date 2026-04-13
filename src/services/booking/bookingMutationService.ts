/**
 * Booking mutation service — ONLY for Planning-specific metadata.
 * 
 * IMPORTANT: ALL booking fields (dates, delivery, logistics, notes, products,
 * status, etc.) must NOT be written locally. Use planningApiService.ts instead,
 * which routes all writes through the Booking API (source of truth).
 * 
 * The functions below are ONLY for Planning-specific operational metadata
 * that does NOT exist in the Booking system:
 * - viewed (read receipt — Planning-only UI flag)
 * - assigned_project_* (project assignment — Planning-only workflow)
 */

import { supabase } from "@/integrations/supabase/client";

export const markBookingAsViewed = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ viewed: true })
    .eq('id', id);

  if (error) {
    console.error('Error marking booking as viewed:', error);
    throw error;
  }
};
