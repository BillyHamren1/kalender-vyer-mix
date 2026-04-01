import { supabase } from "@/integrations/supabase/client";

export interface LocationTimeEntry {
  id: string;
  organization_id: string;
  staff_id: string;
  location_id: string;
  entry_date: string;
  entered_at: string;
  exited_at: string | null;
  source: string;
  total_minutes: number | null;
  created_at: string;
  location_name?: string;
  staff_name?: string;
}

export async function fetchLocationTimeEntries(filters?: {
  date_from?: string;
  date_to?: string;
  staff_id?: string;
  location_id?: string;
}): Promise<LocationTimeEntry[]> {
  let query = supabase
    .from('location_time_entries')
    .select('*')
    .order('entered_at', { ascending: false })
    .limit(500);

  if (filters?.date_from) query = query.gte('entry_date', filters.date_from);
  if (filters?.date_to) query = query.lte('entry_date', filters.date_to);
  if (filters?.staff_id) query = query.eq('staff_id', filters.staff_id);
  if (filters?.location_id) query = query.eq('location_id', filters.location_id);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as LocationTimeEntry[];
}

export async function fetchActiveLocationEntries(): Promise<LocationTimeEntry[]> {
  const { data, error } = await supabase
    .from('location_time_entries')
    .select('*')
    .is('exited_at', null)
    .order('entered_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as LocationTimeEntry[];
}
