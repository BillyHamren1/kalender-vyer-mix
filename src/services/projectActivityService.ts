import { supabase } from "@/integrations/supabase/client";

export interface ProjectActivity {
  id: string;
  project_id: string;
  action: string;
  description: string;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const fetchProjectActivities = async (projectId: string): Promise<ProjectActivity[]> => {
  const { data, error } = await supabase
    .from('project_activity_log')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ProjectActivity[];
};

export const logProjectActivity = async (activity: {
  project_id: string;
  action: string;
  description: string;
  performed_by?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  const insertData: Record<string, unknown> = {
    project_id: activity.project_id,
    action: activity.action,
    description: activity.description,
    performed_by: activity.performed_by || null,
    metadata: activity.metadata || {},
  };
  
  const { error } = await supabase
    .from('project_activity_log')
    .insert(insertData as any);

  if (error) {
    console.error('[ActivityLog] Failed to log activity:', error);
  }
};
