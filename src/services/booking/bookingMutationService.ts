/**
 * Booking mutation service — ONLY for Planning-owned fields.
 * 
 * IMPORTANT: Shared booking fields (dates, delivery, logistics, notes, products)
 * must NOT be written locally. Use planningApiService.ts instead, which routes
 * all writes through the Booking API (source of truth).
 * 
 * The functions below are ONLY for fields that Planning owns locally:
 * - viewed (read receipt)
 * - status (Planning-side status management)
 * - assigned_project_* (project assignment)
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

export const updateBookingStatus = async (id: string, status: string): Promise<void> => {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};
