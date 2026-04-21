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

/**
 * Close all open location_time_entries for a staff member that started before
 * the given cutoff time. Used to prevent double-counting when a travel log
 * starts while a presence (warehouse) timer is still ticking.
 *
 * @param staffId  Staff member id.
 * @param beforeIso Cutoff ISO timestamp. Open entries with entered_at < this
 *                  are closed with exited_at = beforeIso.
 * @returns number of rows closed.
 */
export async function closeOpenEntriesForStaff(
  staffId: string,
  beforeIso: string
): Promise<number> {
  // Find candidates first so we can compute total_minutes per row.
  const { data: openRows, error: fetchErr } = await supabase
    .from('location_time_entries')
    .select('id, entered_at')
    .eq('staff_id', staffId)
    .is('exited_at', null)
    .lt('entered_at', beforeIso);

  if (fetchErr) {
    console.error('[locationTimeService] closeOpenEntriesForStaff fetch failed:', fetchErr);
    return 0;
  }
  if (!openRows || openRows.length === 0) return 0;

  const cutoff = new Date(beforeIso).getTime();
  let closed = 0;
  for (const row of openRows) {
    const enteredMs = new Date(row.entered_at).getTime();
    const minutes = Math.max(0, Math.round((cutoff - enteredMs) / 60000));
    const { error: updErr } = await supabase
      .from('location_time_entries')
      .update({ exited_at: beforeIso, total_minutes: minutes })
      .eq('id', row.id)
      .is('exited_at', null); // race-safety
    if (!updErr) closed++;
    else console.error('[locationTimeService] close row failed:', row.id, updErr);
  }
  console.log(`[locationTimeService] Closed ${closed} open location entries for staff ${staffId} at ${beforeIso}`);
  return closed;
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
