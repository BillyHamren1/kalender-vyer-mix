import { supabase } from "@/integrations/supabase/client";
import { Project, ProjectTask, ProjectComment, ProjectFile, ProjectStatus, ProjectWithBooking } from "@/types/project";
import { recordJobCompletion } from "@/services/jobCompletionAnalyticsService";

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
        booking_number
      )
    `)
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
        client,
        eventdate,
        rigdaydate,
        rigdowndate,
        deliveryaddress,
        delivery_city,
        delivery_postal_code,
        contact_name,
        contact_phone,
        contact_email,
        booking_number,
        carry_more_than_10m,
        ground_nails_allowed,
        exact_time_needed,
        exact_time_info,
        internalnotes
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as unknown as ProjectWithBooking;
};

export const createProject = async (project: { name: string; booking_id?: string | null }): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Project;
};

export const updateProjectStatus = async (id: string, status: ProjectStatus): Promise<void> => {
  // First get the project to check for booking_id
  const { data: project, error: fetchError } = await supabase
    .from('projects')
    .select('booking_id')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;

  // If project is marked as completed and has a booking, record analytics
  if (status === 'completed' && project?.booking_id) {
    console.log('[ProjectService] Project completed, recording job analytics for booking:', project.booking_id);
    // Fire and forget - don't block status update on analytics
    recordJobCompletion(project.booking_id).catch(err => {
      console.error('[ProjectService] Failed to record job completion:', err);
    });
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
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

// Comments
export const fetchProjectComments = async (projectId: string): Promise<ProjectComment[]> => {
  const { data, error } = await supabase
    .from('project_comments')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as ProjectComment[];
};

export const createProjectComment = async (comment: {
  project_id: string;
  author_name: string;
  content: string;
}): Promise<ProjectComment> => {
  const { data, error } = await supabase
    .from('project_comments')
    .insert(comment)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as ProjectComment;
};

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
