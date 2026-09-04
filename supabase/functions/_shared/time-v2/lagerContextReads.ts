/**
 * Shared, READ-ONLY Planning source reads for the Lager-context projection.
 *
 * Used by BOTH `planning-lager-context` (browser read contract) and the
 * `time-planning-proxy` `lager.contextImport` operation so the two paths can
 * never drift: same tables, same columns, same tenant scoping.
 *
 * Every query is scoped to ONE organizationId resolved server-side. Nothing
 * here writes any row.
 */

import type { LagerProjectionInput } from './lagerProjection.ts';

// Minimal structural client type: avoids coupling to a supabase-js version.
interface QueryResult {
  data: unknown[] | null;
  error: { message?: string } | null;
}
export interface LagerReadsClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): unknown;
    };
  };
}

export type LagerProjectionSourceRows = Pick<
  LagerProjectionInput,
  | 'locations'
  | 'internalProjects'
  | 'staffMembers'
  | 'staffAssignments'
  | 'warehouseAssignments'
  | 'warehouseCalendarEvents'
>;

/**
 * Reads the exact Planning rows `buildLagerContextProjection` needs for one
 * organization and inclusive date range. Throws on the FIRST read error so
 * callers fail closed instead of building a projection from partial data.
 */
export async function readLagerProjectionInputs(
  // deno-lint-ignore no-explicit-any
  admin: any,
  organizationId: string,
  from: string,
  to: string,
): Promise<LagerProjectionSourceRows> {
  const [locations, internalProjects, staffMembers, staffAssignments, warehouseAssignments, warehouseEvents] =
    (await Promise.all([
      admin
        .from('organization_locations')
        .select('id, organization_id, name, address, latitude, longitude, radius_meters, geofence_mode, location_type, is_active')
        .eq('organization_id', organizationId),
      admin
        .from('projects')
        .select('id, organization_id, name, is_internal, location_id')
        .eq('organization_id', organizationId)
        .eq('is_internal', true),
      admin
        .from('staff_members')
        .select('id, organization_id, name, is_active')
        .eq('organization_id', organizationId),
      admin
        .from('staff_assignments')
        .select('id, organization_id, staff_id, team_id, assignment_date')
        .eq('organization_id', organizationId)
        .gte('assignment_date', from)
        .lte('assignment_date', to),
      admin
        .from('warehouse_assignments')
        .select('id, organization_id, staff_id, assignment_date, assignment_type, status, title, description, start_time, end_time, booking_id, booking_number, delivery_address, customer_name, warehouse_event_id, packing_id, source')
        .eq('organization_id', organizationId)
        .gte('assignment_date', from)
        .lte('assignment_date', to),
      admin
        .from('warehouse_calendar_events')
        .select('id, organization_id, title, start_time, end_time, resource_id, event_type, booking_id, booking_number, delivery_address, warehouse_project_id')
        .eq('organization_id', organizationId)
        .gte('start_time', `${from}T00:00:00Z`)
        .lte('start_time', `${to}T23:59:59Z`),
    ])) as QueryResult[];

  const firstError =
    locations.error || internalProjects.error || staffMembers.error || staffAssignments.error ||
    warehouseAssignments.error || warehouseEvents.error;
  if (firstError) {
    throw new Error(`lager-context read failed: ${firstError.message ?? 'unknown read error'}`);
  }

  return {
    locations: (locations.data ?? []) as LagerProjectionSourceRows['locations'],
    internalProjects: (internalProjects.data ?? []) as LagerProjectionSourceRows['internalProjects'],
    staffMembers: (staffMembers.data ?? []) as LagerProjectionSourceRows['staffMembers'],
    staffAssignments: (staffAssignments.data ?? []) as LagerProjectionSourceRows['staffAssignments'],
    warehouseAssignments: (warehouseAssignments.data ?? []) as LagerProjectionSourceRows['warehouseAssignments'],
    warehouseCalendarEvents: (warehouseEvents.data ?? []) as LagerProjectionSourceRows['warehouseCalendarEvents'],
  };
}
