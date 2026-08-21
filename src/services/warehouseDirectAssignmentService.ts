import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { assignStaffToTeamCore } from '@/services/staffAssignmentCore';
import { getWarehouseTeamId } from '@/lib/warehouse/warehouseTeam';
import {
  DEFAULT_WAREHOUSE_ACTION_BY_TYPE,
  type WarehouseAssignmentAction,
  type WarehouseAssignmentType,
} from '@/types/warehouseAssignments';

const deriveType = (eventType: string | null | undefined): WarehouseAssignmentType => {
  switch (eventType) {
    case 'packing': return 'packing';
    case 'return':
    case 'unpacking': return 'return';
    case 'inventory': return 'inventory';
    case 'internal_task': return 'internal_task';
    default: return 'other';
  }
};

const deriveAction = (type: WarehouseAssignmentType): WarehouseAssignmentAction =>
  DEFAULT_WAREHOUSE_ACTION_BY_TYPE[type] ?? 'open_details';

/**
 * Assign exactly one person to exactly one warehouse calendar event.
 *
 * The old Lager-N team row is mirrored only as compatibility data for legacy
 * calendar/mobile paths. It MUST NOT be used to infer that the person owns all
 * other jobs in the same legacy team/day.
 */
export async function assignStaffToExactWarehouseEvent(params: {
  staffId: string;
  warehouseEventId: string;
}): Promise<void> {
  const { staffId, warehouseEventId } = params;
  if (!staffId || !warehouseEventId) throw new Error('missing_params');

  const { data: event, error } = await supabase
    .from('warehouse_calendar_events')
    .select('id, organization_id, booking_id, booking_number, title, start_time, end_time, resource_id, event_type, delivery_address')
    .eq('id', warehouseEventId)
    .maybeSingle();

  if (error) throw error;
  if (!event || !event.start_time) throw new Error('warehouse_event_not_found');

  const date = new Date(event.start_time);
  if (Number.isNaN(date.getTime())) throw new Error('invalid_event_date');

  const assignmentType = deriveType(event.event_type);
  const row = {
    staff_id: staffId,
    organization_id: event.organization_id,
    assignment_date: format(date, 'yyyy-MM-dd'),
    assignment_type: assignmentType,
    action: deriveAction(assignmentType),
    title: event.title || 'Lageruppgift',
    description: null,
    status: 'planned' as const,
    start_time: event.start_time,
    end_time: event.end_time,
    warehouse_event_id: event.id,
    booking_id: event.booking_id,
    booking_number: event.booking_number,
    delivery_address: event.delivery_address,
    customer_name: event.title || null,
    source: 'warehouse_calendar_event_direct',
    metadata: {
      event_type: event.event_type,
      resource_id: event.resource_id,
      assignment_scope: 'single_event',
    },
  };

  const { error: upsertError } = await supabase
    .from('warehouse_assignments')
    .upsert(row as any, { onConflict: 'staff_id,warehouse_event_id' });

  if (upsertError) throw upsertError;

  // Compatibility only: old views still expect a staff_assignments Lager-N row.
  // This mirror must never be used by the new personnel calendar to infer jobs.
  const legacyTeamId = getWarehouseTeamId(event.resource_id);
  try {
    await assignStaffToTeamCore(staffId, legacyTeamId, date);
  } catch (compatError) {
    console.warn('[warehouseDirectAssignment] legacy team mirror failed', compatError);
  }
}
