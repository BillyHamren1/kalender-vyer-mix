import { supabase } from "@/integrations/supabase/client";

/**
 * Recomputes the assignment flags for a booking based on actual relations.
 * Checks jobs, projects, and large_project_bookings to determine the correct state.
 * Should be called after any delete/create/convert operation.
 */
export async function recomputeBookingAssignment(bookingId: string): Promise<void> {
  // Check for active jobs
  const { data: activeJobs } = await supabase
    .from('jobs')
    .select('id, name')
    .eq('booking_id', bookingId)
    .neq('status', 'completed')
    .limit(1);

  // Check for active projects (medium)
  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('booking_id', bookingId)
    .not('status', 'in', '("completed","cancelled")')
    .limit(1);

  // Check for large project links
  const { data: largeLinks } = await supabase
    .from('large_project_bookings')
    .select('large_project_id')
    .eq('booking_id', bookingId)
    .limit(1);

  const hasJob = activeJobs && activeJobs.length > 0;
  const hasProject = activeProjects && activeProjects.length > 0;
  const hasLarge = largeLinks && largeLinks.length > 0;

  if (hasLarge) {
    // Large project takes priority
    const { error } = await supabase
      .from('bookings')
      .update({
        assigned_to_project: true,
        assigned_project_id: largeLinks![0].large_project_id,
        assigned_project_name: null,
        large_project_id: largeLinks![0].large_project_id,
      })
      .eq('id', bookingId);
    if (error) throw new Error(`Kunde inte uppdatera bokning: ${error.message}`);
  } else if (hasProject) {
    const p = activeProjects![0];
    const { error } = await supabase
      .from('bookings')
      .update({
        assigned_to_project: true,
        assigned_project_id: p.id,
        assigned_project_name: p.name,
        large_project_id: null,
      })
      .eq('id', bookingId);
    if (error) throw new Error(`Kunde inte uppdatera bokning: ${error.message}`);
  } else if (hasJob) {
    const j = activeJobs![0];
    const { error } = await supabase
      .from('bookings')
      .update({
        assigned_to_project: true,
        assigned_project_id: j.id,
        assigned_project_name: `Jobb: ${j.name}`,
        large_project_id: null,
      })
      .eq('id', bookingId);
    if (error) throw new Error(`Kunde inte uppdatera bokning: ${error.message}`);
  } else {
    // No active links — clear all flags
    const { error } = await supabase
      .from('bookings')
      .update({
        assigned_to_project: false,
        assigned_project_id: null,
        assigned_project_name: null,
        large_project_id: null,
      })
      .eq('id', bookingId);
    if (error) throw new Error(`Kunde inte uppdatera bokning: ${error.message}`);
  }
}
