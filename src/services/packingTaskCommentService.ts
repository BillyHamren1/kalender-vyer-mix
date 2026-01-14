import { supabase } from "@/integrations/supabase/client";
import { PackingTaskComment } from "@/types/packing";

export const fetchPackingTaskComments = async (taskId: string): Promise<PackingTaskComment[]> => {
  const { data, error } = await supabase
    .from('packing_task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as PackingTaskComment[];
};

export const createPackingTaskComment = async (comment: {
  task_id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
}): Promise<PackingTaskComment> => {
  const { data, error } = await supabase
    .from('packing_task_comments')
    .insert(comment)
    .select()
    .single();

  if (error) throw error;
  return data as PackingTaskComment;
};

export const deletePackingTaskComment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('packing_task_comments')
    .delete()
    .eq('id', id);

  if (error) throw error;
};
