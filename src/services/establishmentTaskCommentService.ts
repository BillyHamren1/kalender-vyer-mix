import { supabase } from "@/integrations/supabase/client";

export interface EstablishmentTaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
}

export const fetchEstablishmentTaskComments = async (taskId: string): Promise<EstablishmentTaskComment[]> => {
  const { data, error } = await supabase
    .from('establishment_task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as EstablishmentTaskComment[];
};

export const createEstablishmentTaskComment = async (comment: {
  task_id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
}): Promise<EstablishmentTaskComment> => {
  const { data, error } = await supabase
    .from('establishment_task_comments')
    .insert([comment as any])
    .select()
    .single();

  if (error) throw error;
  return data as unknown as EstablishmentTaskComment;
};

export const updateEstablishmentTaskComment = async (
  id: string,
  content: string
): Promise<EstablishmentTaskComment> => {
  const { data, error } = await supabase
    .from('establishment_task_comments')
    .update({ content })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as EstablishmentTaskComment;
};

export const deleteEstablishmentTaskComment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('establishment_task_comments')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const fetchEstablishmentTaskCommentCounts = async (
  taskIds: string[]
): Promise<Record<string, number>> => {
  if (taskIds.length === 0) return {};
  const { data, error } = await supabase
    .from('establishment_task_comments')
    .select('task_id')
    .in('task_id', taskIds);

  if (error) throw error;
  const counts: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    counts[row.task_id] = (counts[row.task_id] || 0) + 1;
  });
  return counts;
};
