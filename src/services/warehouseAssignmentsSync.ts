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

/**
 * Assign a staff member directly to a single warehouse_calendar_event.
 *
 * - Looks up the event to discover its date and resource_id (lager-N / generic).
 * - Mirrors the staff into staff_assignments on the right Lager team for the
 *   day, so the personal calendar reflects the placement automatically.
 * - Upserts the concrete warehouse_assignments row(s) for that (staff, day).
 *
 * Use this from warehouse-side dialogs where the user picks "assign person to
 * THIS event" without first dragging them into the Lager column.
 */
export async function assignStaffToWarehouseEvent(params: {
  staffId: string;
  warehouseEventId: string;
}): Promise<void> {
  const { staffId, warehouseEventId } = params;
  if (!staffId || !warehouseEventId) return;

  const { data: ev, error } = await supabase
    .from('warehouse_calendar_events')
    .select('id, start_time, resource_id')
    .eq('id', warehouseEventId)
    .maybeSingle();

  if (error || !ev || !ev.start_time) {
    console.error('[warehouseAssignmentsSync] assign: event not found', { warehouseEventId, error });
    return;
  }

  const date = new Date(ev.start_time);
  if (isNaN(date.getTime())) return;

  const teamId = getWarehouseTeamId(ev.resource_id);
  await syncWarehouseAssignmentsForStaffTeamDay({ staffId, teamId, date });
}

/**
 * Assign a staff member directly to a packing project (no calendar event).
 *
 * - Upserts a warehouse_assignments row for (staff_id, packing_id).
 * - Mirrors the staff into staff_assignments on the default Lager team so the
 *   personal calendar shows them in the Lager column.
 *
 * Used from warehouse UI ("Tilldela person till denna packning").
 */
export async function assignStaffToPacking(params: {
  staffId: string;
  packingId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { staffId, packingId } = params;
  if (!staffId || !packingId) return { ok: false, error: 'missing_params' };

  const { data: pk, error: pErr } = await supabase
    .from('packing_projects')
    .select('id, name, status, booking_id, organization_id, start_date, end_date, client_name, delivery_address')
    .eq('id', packingId)
    .maybeSingle();

  if (pErr || !pk) {
    console.error('[warehouseAssignmentsSync] assignStaffToPacking: packing not found', { packingId, pErr });
    return { ok: false, error: 'packing_not_found' };
  }

  const isReturn = pk.status === 'returning' || pk.status === 'back' || pk.status === 'returned';
  const type: WarehouseAssignmentType = isReturn ? 'return' : 'packing';
  const action = deriveAction(type);

  let bookingNumber: string | null = null;
  if (pk.booking_id) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('booking_number')
      .eq('id', pk.booking_id)
      .maybeSingle();
    bookingNumber = (bk as any)?.booking_number ?? null;
  }

  const dateStr = (pk.start_date as string | null) ?? format(new Date(), 'yyyy-MM-dd');
  const teamId = getWarehouseTeamId(null);

  const row = {
    staff_id: staffId,
    organization_id: pk.organization_id,
    assignment_date: dateStr,
    assignment_type: type,
    action,
    title: pk.name || 'Lageruppgift',
    description: null,
    status: 'planned' as const,
    start_time: null,
    end_time: null,
    packing_id: pk.id,
    booking_id: pk.booking_id,
    booking_number: bookingNumber,
    delivery_address: pk.delivery_address,
    customer_name: pk.client_name,
    source: 'manual_packing_assign',
    metadata: { resource_id: teamId, packing_status: pk.status },
  };

  const { error: upErr } = await supabase
    .from('warehouse_assignments')
    .upsert(row as any, { onConflict: 'staff_id,packing_id' });
  if (upErr) {
    console.error('[warehouseAssignmentsSync] assignStaffToPacking upsert failed', upErr);
    return { ok: false, error: upErr.message };
  }

  try {
    await assignStaffToTeamCore(staffId, teamId, new Date(dateStr));
  } catch (e) {
    console.warn('[warehouseAssignmentsSync] mirror to staff_assignments failed', e);
  }

  return { ok: true };
}

/**
 * Remove a staff member's direct packing assignment.
 * Only deletes warehouse_assignments rows linked via packing_id (not via warehouse_event_id).
 */
export async function removeStaffFromPacking(params: {
  staffId: string;
  packingId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { staffId, packingId } = params;
  if (!staffId || !packingId) return { ok: false, error: 'missing_params' };

  const { error } = await supabase
    .from('warehouse_assignments')
    .delete()
    .eq('staff_id', staffId)
    .eq('packing_id', packingId)
    .is('warehouse_event_id', null);

  if (error) {
    console.error('[warehouseAssignmentsSync] removeStaffFromPacking failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
