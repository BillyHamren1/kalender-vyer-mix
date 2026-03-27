import { supabase } from "@/integrations/supabase/client";
import { subDays, addDays, format } from "date-fns";

export interface EstablishmentTask {
  id: string;
  booking_id: string;
  title: string;
  category: string;
  start_date: string;
  end_date: string;
  completed: boolean;
  sort_order: number;
  notes: string | null;
  assigned_to: string | null;
  source: string;
  source_product_id: string | null;
}

export const fetchEstablishmentTasks = async (bookingId: string): Promise<EstablishmentTask[]> => {
  const { data, error } = await supabase
    .from('establishment_tasks')
    .select('id, booking_id, title, category, start_date, end_date, completed, sort_order, notes, assigned_to, source, source_product_id')
    .eq('booking_id', bookingId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as EstablishmentTask[];
};

export const createEstablishmentTask = async (task: {
  booking_id: string;
  title: string;
  category: string;
  start_date: string;
  end_date: string;
  sort_order?: number;
  source?: string;
  source_product_id?: string;
  notes?: string;
}): Promise<EstablishmentTask> => {
  const { data, error } = await supabase
    .from('establishment_tasks')
    .insert({
      booking_id: task.booking_id,
      title: task.title,
      category: task.category,
      start_date: task.start_date,
      end_date: task.end_date,
      sort_order: task.sort_order ?? 0,
      source: task.source ?? 'manual',
      source_product_id: task.source_product_id ?? null,
      notes: task.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as EstablishmentTask;
};

export const updateEstablishmentTask = async (
  id: string,
  updates: Partial<Pick<EstablishmentTask, 'title' | 'category' | 'start_date' | 'end_date' | 'completed' | 'sort_order' | 'notes' | 'assigned_to'>>
): Promise<void> => {
  const { error } = await supabase
    .from('establishment_tasks')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
};

export const deleteEstablishmentTask = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('establishment_tasks')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const generateDefaultTasks = async (
  bookingId: string,
  rigDate: string,
  eventDate: string
): Promise<EstablishmentTask[]> => {
  const rig = new Date(rigDate);
  const event = new Date(eventDate);

  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  const defaults = [
    { title: 'Lastning på lager', category: 'material', start_date: fmt(subDays(rig, 1)), end_date: fmt(subDays(rig, 1)), sort_order: 0 },
    { title: 'Transport till plats', category: 'transport', start_date: fmt(rig), end_date: fmt(rig), sort_order: 1 },
    { title: 'Personal anländer', category: 'personal', start_date: fmt(rig), end_date: fmt(rig), sort_order: 2 },
    { title: 'Lossning & uppställning', category: 'installation', start_date: fmt(rig), end_date: fmt(rig), sort_order: 3 },
    { title: 'Montering dag 1', category: 'installation', start_date: fmt(rig), end_date: fmt(rig), sort_order: 4 },
    { title: 'Montering dag 2', category: 'installation', start_date: fmt(addDays(rig, 1)), end_date: fmt(addDays(rig, 1)), sort_order: 5 },
    { title: 'Slutkontroll & städning', category: 'kontroll', start_date: fmt(subDays(event, 1)), end_date: fmt(subDays(event, 1)), sort_order: 6 },
    { title: 'Överlämning till kund', category: 'kontroll', start_date: fmt(event), end_date: fmt(event), sort_order: 7 },
  ];

  const rows = defaults.map(d => ({
    booking_id: bookingId,
    source: 'default',
    ...d,
  }));

  const { data, error } = await supabase
    .from('establishment_tasks')
    .insert(rows)
    .select();

  if (error) throw error;
  return (data || []) as EstablishmentTask[];
};
