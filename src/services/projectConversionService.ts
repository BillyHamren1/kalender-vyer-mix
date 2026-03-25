import { deleteJob } from '@/services/jobService';
import { deleteProject, createProject } from '@/services/projectService';
import { deleteLargeProject } from '@/services/largeProjectService';
import { supabase } from '@/integrations/supabase/client';

export type ProjectType = 'small' | 'medium' | 'large';

interface DeleteCurrentProjectParams {
  type: ProjectType;
  id: string;
}

/**
 * Get the booking_id linked to a project, regardless of type.
 */
export async function getBookingIdForProject(type: ProjectType, id: string): Promise<string | null> {
  if (type === 'small') {
    const { data } = await supabase.from('jobs').select('booking_id').eq('id', id).single();
    return data?.booking_id ?? null;
  }
  if (type === 'medium') {
    const { data } = await supabase.from('projects').select('booking_id').eq('id', id).single();
    return data?.booking_id ?? null;
  }
  // Large projects can have multiple bookings — not directly convertible
  return null;
}

/**
 * Delete the current project (un-assigns booking automatically via existing service logic).
 */
async function deleteCurrentProject({ type, id }: DeleteCurrentProjectParams): Promise<void> {
  if (type === 'small') await deleteJob(id);
  else if (type === 'medium') await deleteProject(id);
  else await deleteLargeProject(id);
}

/**
 * Convert a project to a medium project.
 * Returns the new project ID.
 */
export async function convertToMedium(current: DeleteCurrentProjectParams, bookingId: string): Promise<string> {
  // Get booking info for naming
  const { data: booking } = await supabase
    .from('bookings')
    .select('client, booking_number')
    .eq('id', bookingId)
    .single();

  const name = booking?.booking_number
    ? `${booking.client} #${booking.booking_number}`
    : booking?.client || 'Projekt';

  await deleteCurrentProject(current);

  const project = await createProject({ name, booking_id: bookingId });

  // Mark booking as assigned
  await supabase
    .from('bookings')
    .update({
      assigned_to_project: true,
      assigned_project_id: project.id,
      assigned_project_name: `Projekt: ${name}`,
    })
    .eq('id', bookingId);

  return project.id;
}

/**
 * Prepare for large project conversion: delete current project, return bookingId.
 * Caller should open the large project dialog with this bookingId.
 */
export async function prepareConvertToLarge(current: DeleteCurrentProjectParams, bookingId: string): Promise<string> {
  await deleteCurrentProject(current);
  return bookingId;
}
