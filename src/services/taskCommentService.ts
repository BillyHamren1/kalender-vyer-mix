import { supabase } from "@/integrations/supabase/client";
import { TaskComment } from "@/types/project";

export const fetchTaskComments = async (taskId: string): Promise<TaskComment[]> => {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as TaskComment[];
};

export const createTaskComment = async (comment: {
  task_id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
}): Promise<TaskComment> => {
  const { data, error } = await supabase
    .from('task_comments')
    .insert(comment)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as TaskComment;
};

export const deleteTaskComment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('task_comments')
    .delete()
    .eq('id', id);

  if (error) throw error;
};
