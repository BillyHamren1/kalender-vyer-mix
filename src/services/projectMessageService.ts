import { supabase } from "@/integrations/supabase/client";
import type { ProjectMessage, ProjectMessageType } from "@/types/projectMessage";

export const fetchProjectMessages = async (
  projectId: string,
  type?: ProjectMessageType,
  supplierId?: string
): Promise<ProjectMessage[]> => {
  let query = supabase
    .from('project_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (type) query = query.eq('type', type);
  if (supplierId) query = query.eq('project_supplier_link_id', supplierId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ProjectMessage[];
};

export const sendProjectMessage = async (msg: {
  project_id: string;
  type: ProjectMessageType;
  message: string;
  sender_name: string;
  project_supplier_link_id?: string | null;
  linked_task_id?: string | null;
}): Promise<ProjectMessage> => {
  const { data, error } = await supabase
    .from('project_messages')
    .insert([{
      project_id: msg.project_id,
      type: msg.type,
      message: msg.message,
      sender_name: msg.sender_name,
      project_supplier_link_id: msg.project_supplier_link_id || null,
      linked_task_id: msg.linked_task_id || null,
    }] as any)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectMessage;
};

export const fetchMessagesForTask = async (taskId: string): Promise<ProjectMessage[]> => {
  const { data, error } = await supabase
    .from('project_messages')
    .select('*')
    .eq('linked_task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as ProjectMessage[];
};

export const deleteProjectMessage = async (id: string) => {
  const { error } = await supabase
    .from('project_messages')
    .delete()
    .eq('id', id);
  if (error) throw error;
};
