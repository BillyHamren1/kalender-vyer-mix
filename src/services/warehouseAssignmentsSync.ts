/**
 * Warehouse Assignments Sync
 * --------------------------
 * Bridges the existing warehouse calendar (warehouse_calendar_events +
 * staff_assignments on `lager-N` / `transport`) into concrete
 * `warehouse_assignments` rows that the Time-app consumes.
 *
 * Design rules:
 *  - Additive only. Never deletes/changes warehouse_calendar_events or
 *    staff_assignments.
 *  - Idempotent. Same (staff_id, warehouse_event_id) always upserts.
 *  - When a person is removed from a team for a date, their warehouse_assignments
 *    for the events on that team/date are removed.
 *  - When events change for a (date, team), we recompute that slice for all
 *    staff currently on that team that day.
 */

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { assignStaffToTeamCore } from '@/services/staffAssignmentCore';
import { getWarehouseTeamId, isWarehouseTeam } from '@/lib/warehouse/warehouseTeam';
import {
  DEFAULT_WAREHOUSE_ACTION_BY_TYPE,
  type WarehouseAssignmentAction,
  type WarehouseAssignmentType,
} from '@/types/warehouseAssignments';

type WarehouseEventRow = {
  id: string;
  organization_id?: string | null;
  booking_id: string | null;
  booking_number: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  resource_id: string | null;
  event_type: string | null;
  delivery_address: string | null;
};

const isLagerTeamId = (teamId: string | null | undefined): boolean =>
  isWarehouseTeam(teamId);

/** event_type → assignment_type */
function deriveType(eventType: string | null | undefined): WarehouseAssignmentType {
  switch (eventType) {
    case 'packing':
      return 'packing';
    case 'return':
    case 'unpacking':
      return 'return';
    case 'inventory':
      return 'inventory';
    case 'internal_task':
      return 'internal_task';
    default:
      return 'other';
  }
}

/** assignment_type → default action */
function deriveAction(type: WarehouseAssignmentType): WarehouseAssignmentAction {
  return DEFAULT_WAREHOUSE_ACTION_BY_TYPE[type] ?? 'open_details';
}

/** Convert event row + staff into an upsertable warehouse_assignments row. */
function toAssignmentRow(staffId: string, dateStr: string, ev: WarehouseEventRow) {
  const type = deriveType(ev.event_type);
  return {
    staff_id: staffId,
    assignment_date: dateStr,
    assignment_type: type,
    action: deriveAction(type),
    title: ev.title || 'Lageruppgift',
    description: null as string | null,
    status: 'planned' as const,
    start_time: ev.start_time,
    end_time: ev.end_time,
    warehouse_event_id: ev.id,
    booking_id: ev.booking_id,
    booking_number: ev.booking_number,
    delivery_address: ev.delivery_address,
    customer_name: ev.title || null,
    source: 'warehouse_calendar_event' as const,
    metadata: {
      event_type: ev.event_type,
      resource_id: ev.resource_id,
    },
  };
}

/**
 * Fetch the warehouse events for a given (date, teamId).
 * teamId may be 'lager-N', 'transport', or 'warehouse'.
 */
async function fetchEventsForTeamDay(date: Date, teamId: string): Promise<WarehouseEventRow[]> {
  const dayStart = `${format(date, 'yyyy-MM-dd')}T00:00:00`;
  const dayEnd = `${format(date, 'yyyy-MM-dd')}T23:59:59`;

  const { data, error } = await supabase
    .from('warehouse_calendar_events')
    .select(
      'id, organization_id, booking_id, booking_number, title, start_time, end_time, resource_id, event_type, delivery_address',
    )
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd)
    .eq('resource_id', teamId);

  if (error) {
    console.error('[warehouseAssignmentsSync] fetchEventsForTeamDay failed', error);
    return [];
  }
  return (data || []) as WarehouseEventRow[];
}

/**
 * Upsert warehouse_assignments for a single (staff, date, team).
 * - Creates/updates one row per warehouse_calendar_event for this team/day.
 * - Deletes rows for events that no longer exist for this staff+day+team.
 */
export async function syncWarehouseAssignmentsForStaffTeamDay(params: {
  staffId: string;
  teamId: string;
  date: Date;
}): Promise<void> {
  const { staffId, teamId, date } = params;
  if (!staffId || !isLagerTeamId(teamId)) return;

  const dateStr = format(date, 'yyyy-MM-dd');
  const events = await fetchEventsForTeamDay(date, teamId);

  // Upsert one row per event.
  if (events.length > 0) {
    const rows = events.map((ev) => toAssignmentRow(staffId, dateStr, ev));
    const { error } = await supabase
      .from('warehouse_assignments')
      .upsert(rows as any, { onConflict: 'staff_id,warehouse_event_id' });
    if (error) {
      console.error('[warehouseAssignmentsSync] upsert failed', error);
    } else {
      // Mirror Lager-placement into staff_assignments so the personal calendar
      // automatically shows this person in the Lager column on this day.
      try {
        await assignStaffToTeamCore(staffId, teamId, date);
      } catch (e) {
        console.warn('[warehouseAssignmentsSync] could not mirror staff_assignments', e);
      }
    }
  }

  // Remove orphans: rows for this staff+date whose warehouse_event_id is no
  // longer in this team's event list (e.g. event moved to another resource).
  const validEventIds = new Set(events.map((e) => e.id));
  const { data: existing } = await supabase
    .from('warehouse_assignments')
    .select('id, warehouse_event_id, metadata')
    .eq('staff_id', staffId)
    .eq('assignment_date', dateStr);

  const stale =
    (existing || []).filter((row: any) => {
      const evId = row.warehouse_event_id as string | null;
      const resourceId = (row.metadata?.resource_id as string | null) ?? null;
      // Only consider rows that belonged to this team
      return resourceId === teamId && evId && !validEventIds.has(evId);
    }) ?? [];

  if (stale.length > 0) {
    const ids = stale.map((r: any) => r.id);
    const { error } = await supabase.from('warehouse_assignments').delete().in('id', ids);
    if (error) {
      console.error('[warehouseAssignmentsSync] cleanup failed', error);
    }
  }
}

/**
 * Remove all warehouse_assignments for a staff member on a date+team
 * (used when staff is removed from a lager column for that day).
 */
export async function removeWarehouseAssignmentsForStaffTeamDay(params: {
  staffId: string;
  teamId: string | null;
  date: Date;
}): Promise<void> {
  const { staffId, teamId, date } = params;
  if (!staffId) return;
  const dateStr = format(date, 'yyyy-MM-dd');

  // Find rows for this staff+date (optionally filtered by team via metadata.resource_id).
  const { data: rows, error } = await supabase
    .from('warehouse_assignments')
    .select('id, metadata')
    .eq('staff_id', staffId)
    .eq('assignment_date', dateStr);
  if (error) {
    console.error('[warehouseAssignmentsSync] remove select failed', error);
    return;
  }
  const targetIds = (rows || [])
    .filter((r: any) => {
      if (!teamId) return true;
      return (r.metadata?.resource_id as string | null) === teamId;
    })
    .map((r: any) => r.id);

  if (targetIds.length === 0) return;

  const { error: delErr } = await supabase
    .from('warehouse_assignments')
    .delete()
    .in('id', targetIds);
  if (delErr) {
    console.error('[warehouseAssignmentsSync] remove delete failed', delErr);
  }
}

/**
 * Recompute warehouse_assignments for ALL staff currently assigned to a given
 * (date, teamId). Used after events for that team/day are mutated.
 */
export async function syncWarehouseAssignmentsForTeamDay(params: {
  teamId: string;
  date: Date;
}): Promise<void> {
  const { teamId, date } = params;
  if (!isLagerTeamId(teamId)) return;
  const dateStr = format(date, 'yyyy-MM-dd');

  const { data: assigns, error } = await supabase
    .from('staff_assignments')
    .select('staff_id')
    .eq('team_id', teamId)
    .eq('assignment_date', dateStr);
  if (error) {
    console.error('[warehouseAssignmentsSync] team-day select failed', error);
    return;
  }
  const staffIds = Array.from(new Set((assigns || []).map((a: any) => a.staff_id).filter(Boolean)));
  for (const staffId of staffIds) {
    await syncWarehouseAssignmentsForStaffTeamDay({ staffId, teamId, date });
  }
}

/**
 * Recompute for every (date, teamId) touched by a list of warehouse events.
 * Useful after syncBookingToWarehouseCalendar inserted events.
 */
export async function syncWarehouseAssignmentsForEvents(
  events: Array<{ start_time: string; resource_id: string | null }>,
): Promise<void> {
  const seen = new Set<string>();
  for (const ev of events) {
    if (!ev.resource_id || !isLagerTeamId(ev.resource_id)) continue;
    const date = new Date(ev.start_time);
    if (isNaN(date.getTime())) continue;
    const key = `${format(date, 'yyyy-MM-dd')}::${ev.resource_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await syncWarehouseAssignmentsForTeamDay({ teamId: ev.resource_id, date });
  }
}
