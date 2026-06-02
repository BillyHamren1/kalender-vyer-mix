// Shared CANCELLED booking handler.
// Used by both import-bookings (when external API returns a CANCELLED row)
// and reconcile-booking-status (active reconciler that catches cancellations
// the incremental ?since-sync misses).
//
// IMPORTANT: this is a 1:1 extraction of the inline logic in
// supabase/functions/import-bookings/index.ts (around line 2558–2710).
// Keep behavior identical — when changing one, change both, or finish the
// planned refactor that has import-bookings call this helper.

export interface ExistingBookingForCancellation {
  id: string;
  version?: number | null;
  assigned_to_project?: boolean | null;
  assigned_project_id?: string | null;
  assigned_project_name?: string | null;
}

export interface CancellationResult {
  status: 'cancelled' | 'skipped_already_cancelled' | 'error';
  booking_id: string;
  calendar_events_deleted?: boolean;
  warehouse_events_deleted?: boolean;
  projects_updated?: boolean;
  jobs_updated?: boolean;
  packing_deleted?: boolean;
  products_deleted?: boolean;
  error?: string;
}

export async function applyBookingCancellation(
  supabase: any,
  existingBooking: ExistingBookingForCancellation,
): Promise<CancellationResult> {
  const bookingId = existingBooking.id;
  const result: CancellationResult = { status: 'cancelled', booking_id: bookingId };

  try {
    // Decide whether to keep "manually hidden cancelled" state.
    const [{ data: cancelledProjects }, { data: cancelledJobs }, { data: anyCancelledProjects }, { data: anyCancelledJobs }] = await Promise.all([
      supabase.from('projects').select('id').eq('booking_id', bookingId).neq('status', 'cancelled').limit(1),
      supabase.from('jobs').select('id').eq('booking_id', bookingId).not('status', 'in', '("completed","cancelled")').limit(1),
      supabase.from('projects').select('id').eq('booking_id', bookingId).eq('status', 'cancelled').limit(1),
      supabase.from('jobs').select('id').eq('booking_id', bookingId).eq('status', 'cancelled').limit(1),
    ]);

    const hasCancelledLink =
      (anyCancelledProjects && anyCancelledProjects.length > 0) ||
      (anyCancelledJobs && anyCancelledJobs.length > 0);

    const wasManuallyHidden =
      existingBooking.assigned_to_project === true &&
      !existingBooking.assigned_project_id &&
      !existingBooking.assigned_project_name;

    const noActiveLinks =
      (!cancelledProjects || cancelledProjects.length === 0) &&
      (!cancelledJobs || cancelledJobs.length === 0);

    const keepManuallyHiddenCancelled = noActiveLinks && (wasManuallyHidden || hasCancelledLink);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        assigned_to_project: keepManuallyHiddenCancelled ? true : false,
        assigned_project_id: keepManuallyHiddenCancelled ? null : existingBooking.assigned_project_id ?? null,
        assigned_project_name: keepManuallyHiddenCancelled ? null : existingBooking.assigned_project_name ?? null,
        version: (existingBooking.version || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      result.status = 'error';
      result.error = `bookings.update failed: ${updateError.message}`;
      return result;
    }

    // Calendar events
    const { error: deleteCalError } = await supabase.from('calendar_events').delete().eq('booking_id', bookingId);
    result.calendar_events_deleted = !deleteCalError;
    if (deleteCalError) console.error(`[cancellation] calendar_events delete failed for ${bookingId}:`, deleteCalError);

    // Warehouse calendar events
    const { error: deleteWhError } = await supabase.from('warehouse_calendar_events').delete().eq('booking_id', bookingId);
    result.warehouse_events_deleted = !deleteWhError;
    if (deleteWhError) console.error(`[cancellation] warehouse_calendar_events delete failed for ${bookingId}:`, deleteWhError);

    // Projects → cancelled
    const { error: projectUpdateError } = await supabase
      .from('projects')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('booking_id', bookingId);
    result.projects_updated = !projectUpdateError;
    if (projectUpdateError) console.error(`[cancellation] projects update failed for ${bookingId}:`, projectUpdateError);

    // Jobs → cancelled
    const { error: jobUpdateError } = await supabase
      .from('jobs')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('booking_id', bookingId);
    result.jobs_updated = !jobUpdateError;
    if (jobUpdateError) console.error(`[cancellation] jobs update failed for ${bookingId}:`, jobUpdateError);

    // Packing projects → delete
    const { error: deletePackingError } = await supabase.from('packing_projects').delete().eq('booking_id', bookingId);
    result.packing_deleted = !deletePackingError;
    if (deletePackingError) console.error(`[cancellation] packing_projects delete failed for ${bookingId}:`, deletePackingError);

    // Booking products → delete
    const { error: deleteProductsError } = await supabase.from('booking_products').delete().eq('booking_id', bookingId);
    result.products_deleted = !deleteProductsError;
    if (deleteProductsError) console.error(`[cancellation] booking_products delete failed for ${bookingId}:`, deleteProductsError);

    console.log(`[cancellation] Fully processed CANCELLED booking ${bookingId}`);
    return result;
  } catch (err: any) {
    result.status = 'error';
    result.error = err?.message || String(err);
    console.error(`[cancellation] Unexpected error for ${bookingId}:`, err);
    return result;
  }
}
