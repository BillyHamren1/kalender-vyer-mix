
import { supabase } from "@/integrations/supabase/client";
import { syncBookingToPacking } from "@/services/booking/bookingPackingSyncService";
import { updateBookingStatusViaApi } from "@/services/planningApiService";

export type BookingStatus = 'OFFER' | 'CONFIRMED' | 'CANCELLED';

export const updateBookingStatusWithCalendarSync = async (
  id: string, 
  newStatus: BookingStatus,
  previousStatus?: string
): Promise<void> => {
  console.log(`Updating booking ${id} status from ${previousStatus} to ${newStatus}`);

  // Get the current booking data before update (for side-effects)
  const { data: oldBooking, error: fetchError } = await supabase
    .from('bookings')
    .select('organization_id')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error('Error fetching booking for status update:', fetchError);
    throw fetchError;
  }

  // Update status via Booking API (source of truth) — NOT locally
  await updateBookingStatusViaApi(id, newStatus);

  // Sync packing project (non-blocking - DB trigger handles name, this syncs list items)
  if (oldBooking?.organization_id) {
    syncBookingToPacking(id, oldBooking.organization_id);
  }
};

export const getStatusColor = (status: BookingStatus): string => {
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return 'bg-gray-50 text-gray-500 hover:bg-gray-50 border border-gray-200';
    case 'CANCELLED':
      return 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200';
    case 'OFFER':
      return 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200';
    default:
      return 'bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200';
  }
};

/**
 * When a booking is cancelled or downgraded to offer,
 * auto-update linked projects/jobs and reset assignment flags.
 */
export const handleBookingLifecycleSideEffects = async (
  bookingId: string,
  newStatus: BookingStatus
): Promise<void> => {
  console.log(`Running lifecycle side-effects for booking ${bookingId} → ${newStatus}`);

  // Handle reactivation: CONFIRMED after being cancelled
  if (newStatus === 'CONFIRMED') {
    // Reactivate cancelled projects
    await supabase
      .from('projects')
      .update({ status: 'planning' })
      .eq('booking_id', bookingId)
      .eq('status', 'cancelled');

    // Reactivate cancelled jobs
    await supabase
      .from('jobs')
      .update({ status: 'active' })
      .eq('booking_id', bookingId)
      .eq('status', 'cancelled');

    console.log(`Reactivated cancelled projects/jobs for booking ${bookingId}`);
    return;
  }

  if (newStatus !== 'CANCELLED' && newStatus !== 'OFFER') return;

  // 1. Cancel linked jobs
  await supabase
    .from('jobs')
    .update({ status: 'cancelled' })
    .eq('booking_id', bookingId)
    .not('status', 'in', '("completed","cancelled")');

  // 2. Cancel linked projects
  await supabase
    .from('projects')
    .update({ status: 'cancelled' })
    .eq('booking_id', bookingId)
    .not('status', 'in', '("completed","cancelled")');

  // 3. For CANCELLED: mark as handled so it does NOT flash in triage
  //    For OFFER: reset so it appears in triage for re-assignment
  if (newStatus === 'CANCELLED') {
    await supabase
      .from('bookings')
      .update({ assigned_to_project: true })
      .eq('id', bookingId);
  } else {
    await supabase
      .from('bookings')
      .update({
        assigned_to_project: false,
        assigned_project_id: null,
        assigned_project_name: null,
      })
      .eq('id', bookingId);
  }
};

export const getStatusIcon = (status: BookingStatus): string => {
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return 'CheckCircle';
    case 'CANCELLED':
      return 'XCircle';
    case 'OFFER':
      return 'Clock';
    default:
      return 'AlertTriangle';
  }
};
