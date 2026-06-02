/**
 * loadProjectAssignedDays
 * ============================================================================
 * Hämtar "personer planerade i personalkalendern" för ett projekt och
 * returnerar `AssignedDay[]` att skicka till buildProjectDailyStaffTimeOverview.
 *
 * Två lägen:
 *
 * 1) Large project (`largeProjectId` finns):
 *    → Sanningen är `large_project_team_assignments` (team per phase+date)
 *      JOIN `staff_assignments` (staff per team+date).
 *    → Syskonbokningarnas BSA IGNORERAS helt (se memory:
 *      "Large project planning unit" och
 *      "large-project-team-source-of-truth-v1").
 *
 * 2) Vanlig booking (`bookingIds` utan largeProjectId):
 *    → `booking_staff_assignments` paginerat (1000 per sida) så vi inte
 *      tystkapas av PostgREST default-limit.
 *
 * Inga skrivningar. Inga side-effects.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssignedDay } from './projectDailyStaffTimeOverview';

const PAGE_SIZE = 1000;

export async function loadLargeProjectAssignedDays(
  supabase: SupabaseClient,
  largeProjectId: string,
): Promise<AssignedDay[]> {
  const { data: lpAssignments, error: lpErr } = await supabase
    .from('large_project_team_assignments')
    .select('assignment_date, team_id')
    .eq('large_project_id', largeProjectId);
  if (lpErr) throw lpErr;
  if (!lpAssignments || lpAssignments.length === 0) return [];

  // Unika (date, team_id)-par. (phase ignoreras — flera faser samma dag
  // räknas som samma planerade pass för personalen.)
  const pairs = new Map<string, { date: string; team_id: string }>();
  for (const r of lpAssignments as Array<any>) {
    if (!r.assignment_date || !r.team_id) continue;
    const date = String(r.assignment_date).slice(0, 10);
    const team_id = String(r.team_id);
    pairs.set(`${date}|${team_id}`, { date, team_id });
  }
  if (pairs.size === 0) return [];

  const dates = Array.from(new Set(Array.from(pairs.values()).map((p) => p.date))).sort();
  const teamIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.team_id)));
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  const { data: saRows, error: saErr } = await supabase
    .from('staff_assignments')
    .select('staff_id, team_id, assignment_date')
    .in('team_id', teamIds)
    .gte('assignment_date', minDate)
    .lte('assignment_date', maxDate);
  if (saErr) throw saErr;

  const out: AssignedDay[] = [];
  const seen = new Set<string>();
  for (const r of (saRows ?? []) as Array<any>) {
    const date = String(r.assignment_date).slice(0, 10);
    const team_id = String(r.team_id);
    if (!pairs.has(`${date}|${team_id}`)) continue; // bara LP-planerade par
    const key = `${date}|${r.staff_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, staff_id: r.staff_id, source: 'lp_team' });
  }
  return out;
}

export async function loadBookingAssignedDays(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<AssignedDay[]> {
  if (bookingIds.length === 0) return [];
  const seen = new Set<string>();
  const out: AssignedDay[] = [];
  let from = 0;
  // Paginera i steg om PAGE_SIZE tills vi får tomt batch.
  // Skydd: max 50 sidor (50k rader) — ska räcka för alla rimliga projekt.
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id, assignment_date')
      .in('booking_id', bookingIds)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<any>;
    for (const r of rows) {
      if (!r.assignment_date || !r.staff_id) continue;
      const date = String(r.assignment_date).slice(0, 10);
      const key = `${date}|${r.staff_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date, staff_id: r.staff_id, source: 'bsa' });
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}
