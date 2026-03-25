import { markReadyForInvoicing } from '@/services/planningApiService';
import { supabase } from '@/integrations/supabase/client';

export interface SyncResult {
  successIds: string[];
  failedIds: string[];
  errors: string[];
}

/**
 * Sync one or more bookings to external Booking system (markReadyForInvoicing).
 * Returns a structured result so callers can decide whether to proceed.
 */
export async function syncBookingsForInvoicing(bookingIds: string[]): Promise<SyncResult> {
  const unique = [...new Set(bookingIds.filter(Boolean))];
  const result: SyncResult = { successIds: [], failedIds: [], errors: [] };

  if (unique.length === 0) return result;

  await Promise.all(
    unique.map(async (id) => {
      try {
        await markReadyForInvoicing(id);
        result.successIds.push(id);
      } catch (err: any) {
        result.failedIds.push(id);
        result.errors.push(`Booking ${id}: ${err?.message || 'Okänt fel'}`);
        console.error(`[BookingCloseSync] Failed for ${id}:`, err);
      }
    })
  );

  return result;
}

/**
 * Get all booking IDs linked to a large project.
 */
export async function getLargeProjectBookingIds(largeProjectId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', largeProjectId);
  if (error) {
    console.error('[BookingCloseSync] Failed to fetch large project bookings:', error);
    return [];
  }
  return (data || []).map(r => r.booking_id);
}

/**
 * Get booking ID for a job (small project).
 */
export async function getJobBookingId(jobId: string): Promise<string | null> {
  const { data } = await supabase.from('jobs').select('booking_id').eq('id', jobId).single();
  return data?.booking_id ?? null;
}

/**
 * Get booking ID for a medium project.
 */
export async function getProjectBookingId(projectId: string): Promise<string | null> {
  const { data } = await supabase.from('projects').select('booking_id').eq('id', projectId).single();
  return data?.booking_id ?? null;
}

/**
 * Resync all recently closed projects that have linked bookings.
 * Returns aggregated result.
 */
export async function resyncClosedProjects(): Promise<SyncResult & { totalProjects: number }> {
  const allBookingIds: string[] = [];
  let totalProjects = 0;

  // Closed jobs (small)
  const { data: closedJobs } = await supabase
    .from('jobs')
    .select('id, booking_id')
    .eq('status', 'completed')
    .not('booking_id', 'is', null);
  if (closedJobs) {
    totalProjects += closedJobs.length;
    allBookingIds.push(...closedJobs.map(j => j.booking_id!));
  }

  // Closed medium projects
  const { data: closedProjects } = await supabase
    .from('projects')
    .select('id, booking_id')
    .eq('status', 'completed')
    .not('booking_id', 'is', null);
  if (closedProjects) {
    totalProjects += closedProjects.length;
    allBookingIds.push(...closedProjects.map(p => p.booking_id!));
  }

  // Closed large projects — fetch their bookings from junction table
  const { data: closedLarge } = await supabase
    .from('large_projects')
    .select('id')
    .eq('status', 'completed');
  if (closedLarge && closedLarge.length > 0) {
    totalProjects += closedLarge.length;
    const largeIds = closedLarge.map(lp => lp.id);
    const { data: lpBookings } = await supabase
      .from('large_project_bookings')
      .select('booking_id')
      .in('large_project_id', largeIds);
    if (lpBookings) {
      allBookingIds.push(...lpBookings.map(b => b.booking_id));
    }
  }

  const result = await syncBookingsForInvoicing(allBookingIds);
  return { ...result, totalProjects };
}
