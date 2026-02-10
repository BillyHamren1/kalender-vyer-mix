import { supabase } from "@/integrations/supabase/client";

export interface EstablishmentSubtask {
  id: string;
  booking_id: string;
  parent_task_id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  assigned_to: string | null;
  completed: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchSubtasks(bookingId: string, parentTaskId: string): Promise<EstablishmentSubtask[]> {
  const { data, error } = await supabase
    .from("establishment_subtasks")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("parent_task_id", parentTaskId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data || []) as EstablishmentSubtask[];
}

export async function fetchAllSubtasksForBooking(bookingId: string): Promise<EstablishmentSubtask[]> {
  const { data, error } = await supabase
    .from("establishment_subtasks")
    .select("*")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data || []) as EstablishmentSubtask[];
}

export async function createSubtask(subtask: {
  booking_id: string;
  parent_task_id: string;
  title: string;
  sort_order?: number;
}): Promise<EstablishmentSubtask> {
  const { data, error } = await supabase
    .from("establishment_subtasks")
    .insert(subtask)
    .select()
    .single();

  if (error) throw error;
  return data as EstablishmentSubtask;
}

export async function updateSubtask(
  id: string,
  updates: Partial<Pick<EstablishmentSubtask, 'title' | 'description' | 'start_time' | 'end_time' | 'assigned_to' | 'completed' | 'sort_order' | 'notes'>>
): Promise<EstablishmentSubtask> {
  const { data, error } = await supabase
    .from("establishment_subtasks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as EstablishmentSubtask;
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase
    .from("establishment_subtasks")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
