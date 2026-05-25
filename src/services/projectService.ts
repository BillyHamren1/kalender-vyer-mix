import { supabase } from "@/integrations/supabase/client";
import { Project, ProjectTask, ProjectComment, ProjectFile, ProjectStatus, ProjectWithBooking } from "@/types/project";
import { recordJobCompletion } from "@/services/jobCompletionAnalyticsService";
import { recomputeBookingAssignment } from "@/services/bookingAssignmentService";

// Projects
export const fetchProjects = async (): Promise<ProjectWithBooking[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      booking:bookings(
        id,
        client,
        eventdate,
        deliveryaddress,
        contact_name,
        contact_phone,
        contact_email,
        booking_number,
        status
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ProjectWithBooking[];
};

export const fetchProject = async (id: string): Promise<ProjectWithBooking | null> => {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      booking:bookings(
        id,
        large_project_id,
        client,
        eventdate,
        rigdaydate,
        rigdowndate,
        deliveryaddress,
        delivery_city,
        delivery_postal_code,
        delivery_latitude,
        delivery_longitude,
        contact_name,
        contact_phone,
        contact_email,
        booking_number,
        carry_more_than_10m,
        ground_nails_allowed,
        exact_time_needed,
        exact_time_info,
        rental_only,
        internalnotes
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as ProjectWithBooking;
};

export const createProject = async (project: {
  name: string;
  booking_id?: string | null;
  project_leader?: string | null;
  client?: string | null;
  deliveryaddress?: string | null;
  delivery_city?: string | null;
  delivery_postal_code?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  eventdate?: string | null;
  rigdaydate?: string | null;
  rigdowndate?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  internalnotes?: string | null;
  rig_start_time?: string | null;
  rig_end_time?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  rigdown_start_time?: string | null;
  rigdown_end_time?: string | null;
}): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Project;
};

export const updateProjectFields = async (id: string, updates: Record<string, unknown>): Promise<void> => {
  const { error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
};

export const updateProjectStatus = async (id: string, status: ProjectStatus): Promise<void> => {
  // First get the project to check for booking_id
  const { data: project, error: fetchError } = await supabase
    .from('projects')
    .select('booking_id')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  // If completing and has a booking, sync to Booking system FIRST
  if (status === 'completed' && project?.booking_id) {
    console.log('[ProjectService] Project completing, syncing booking:', project.booking_id);
    const { syncBookingsForInvoicing } = await import('@/services/bookingCloseSyncService');
    const result = await syncBookingsForInvoicing([project.booking_id]);
    if (result.failedIds.length > 0) {
      throw new Error('Kunde inte synka till Booking-systemet. Projektet stängdes inte.');
    }
  }

  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;

  // Record analytics (fire and forget)
  if (status === 'completed' && project?.booking_id) {
    recordJobCompletion(project.booking_id).catch(err => {
      console.error('[ProjectService] Failed to record job completion:', err);
    });
  }
};

/**
 * Cancel a project (and hide from active views) without deleting it.
 * Sets status='cancelled' on the project and marks the linked booking as
 * "manually hidden cancelled" so import-bookings won't reintroduce it
 * into the project inbox. History, comments and files are preserved.
 */
export const cancelProject = async (id: string, performedBy?: string): Promise<{ bookingId: string | null }> => {
  const { data: project, error: fetchError } = await supabase
    .from('projects')
    .select('booking_id, name, is_internal')
    .eq('id', id)
    .single();

  if (fetchError) throw new Error(`Kunde inte hämta projekt: ${fetchError.message}`);
  if (project?.is_internal) throw new Error('Interna projekt kan inte avbokas');

  const { error } = await supabase
    .from('projects')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Kunde inte avboka projekt: ${error.message}`);

  // Mark booking as manually-hidden cancelled so import-bookings preserves the hidden state
  if (project?.booking_id) {
    await supabase
      .from('bookings')
      .update({
        assigned_to_project: true,
        assigned_project_id: null,
        assigned_project_name: null,
      })
      .eq('id', project.booking_id);
  }

  await (supabase.from('project_audit_log') as any).insert({
    project_id: id,
    project_type: 'medium',
    action: 'cancel',
    booking_id: project?.booking_id || null,
    performed_by: performedBy || null,
    details: { name: project?.name },
  });

  return { bookingId: project?.booking_id || null };
};

export const deleteProject = async (id: string, performedBy?: string): Promise<{ bookingId: string | null }> => {
  // First, fetch the project to get the booking_id, name, and is_internal flag
  const { data: project, error: fetchError } = await supabase
    .from('projects')
    .select('booking_id, name, is_internal')
    .eq('id', id)
    .single();

  if (fetchError) throw new Error(`Kunde inte hämta projekt: ${fetchError.message}`);

  // Block deletion of internal projects
  if (project?.is_internal) {
    throw new Error('Interna projekt kan inte tas bort');
  }

  // Soft-delete the project
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Kunde inte radera projekt: ${error.message}`);

  // Log to audit trail
  await (supabase.from('project_audit_log') as any).insert({
    project_id: id,
    project_type: 'medium',
    action: 'soft_delete',
    booking_id: project?.booking_id || null,
    performed_by: performedBy || null,
    details: { name: project?.name },
  });

  // Recompute booking assignment based on remaining relations
  const bookingId = project?.booking_id || null;
  if (bookingId) {
    await recomputeBookingAssignment(bookingId);
  }

  return { bookingId };
};

export const restoreProject = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: null })
    .eq('id', id);
  if (error) throw error;

  // Re-assign booking
  const { data: project } = await supabase.from('projects').select('booking_id, name').eq('id', id).single();
  if (project?.booking_id) {
    await supabase.from('bookings').update({
      assigned_to_project: true,
      assigned_project_id: id,
      assigned_project_name: `Projekt: ${project.name}`,
    }).eq('id', project.booking_id);
  }

  await (supabase.from('project_audit_log') as any).insert({
    project_id: id,
    project_type: 'medium',
    action: 'restore',
    booking_id: project?.booking_id || null,
    details: { name: project?.name },
  });
};

export const fetchDeletedProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, booking_id, deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

// Tasks
export const fetchProjectTasks = async (projectId: string): Promise<ProjectTask[]> => {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as ProjectTask[];
};

export const createProjectTask = async (task: {
  project_id: string;
  title: string;
  description?: string;
  assigned_to?: string | null;
  deadline?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  phase?: string | null;
  dependency_task_id?: string | null;
}): Promise<ProjectTask> => {
  const { data, error } = await supabase
    .from('project_tasks')
    .insert(task)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as ProjectTask;
};

export const updateProjectTask = async (id: string, updates: Partial<ProjectTask>): Promise<void> => {
  const { error } = await supabase
    .from('project_tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
};

export const deleteProjectTask = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('project_tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Comments — REMOVED. Use `internalnotes` field on the project instead.

// Files
export const fetchProjectFiles = async (projectId: string): Promise<ProjectFile[]> => {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ProjectFile[];
};

export const uploadProjectFile = async (
  projectId: string,
  file: File,
  uploadedBy?: string
): Promise<ProjectFile> => {
  const fileName = `${projectId}/${Date.now()}-${file.name}`;
  
  const { error: uploadError } = await supabase.storage
    .from('project-files')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('project-files')
    .getPublicUrl(fileName);

  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_type: file.type,
      url: urlData.publicUrl,
      uploaded_by: uploadedBy
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as ProjectFile;
};

export const deleteProjectFile = async (id: string, url: string): Promise<void> => {
  // Extract file path from URL
  const urlParts = url.split('/project-files/');
  if (urlParts.length > 1) {
    const filePath = urlParts[1];
    await supabase.storage.from('project-files').remove([filePath]);
  }

  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const fetchBookingAttachments = async (bookingId: string) => {
  const { data, error } = await supabase
    .from('booking_attachments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data || [];
};
