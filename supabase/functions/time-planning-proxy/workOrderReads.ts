/**
 * Read-only Planning source reads that feed `work-order.v1` for the
 * `worker.assignments.sync` boundary. Every query is scoped to ONE
 * organization and to the bookings/projects already bound to the worker's
 * assignments. Cost/price/margin/internal-note columns are never selected —
 * exclusion happens at the read, not only at the mapping.
 */

import type {
  WorkOrderCalendarPhaseRow,
  WorkOrderEstablishmentTaskRow,
  WorkOrderFileRow,
  WorkOrderProductRow,
  WorkOrderProjectTaskRow,
  WorkOrderStaffRow,
  WorkOrderTeamRow,
} from '../_shared/time-v2/workOrderV1Builder.ts';

export interface WorkOrderSourceBundle {
  readonly products: readonly WorkOrderProductRow[];
  readonly calendarPhases: readonly WorkOrderCalendarPhaseRow[];
  readonly attachments: readonly WorkOrderFileRow[];
  readonly projectFiles: readonly WorkOrderFileRow[];
  readonly establishmentTasks: readonly WorkOrderEstablishmentTaskRow[];
  readonly projectTasks: readonly WorkOrderProjectTaskRow[];
  readonly teamRows: readonly WorkOrderTeamRow[];
  readonly staffById: ReadonlyMap<string, WorkOrderStaffRow>;
  /** Table names whose read failed; the work order is built without them and the gap is reported. */
  readonly readFailures: readonly string[];
}

export interface WorkOrderReadScope {
  // deno-lint-ignore no-explicit-any
  readonly admin: any;
  readonly organizationId: string;
  readonly staffId: string;
  readonly bookingIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly dates: readonly string[];
  /** project_leader values that look like staff ids — resolved to names for contacts. */
  readonly leaderRefs: readonly string[];
}

const EMPTY: WorkOrderSourceBundle = {
  products: [],
  calendarPhases: [],
  attachments: [],
  projectFiles: [],
  establishmentTasks: [],
  projectTasks: [],
  teamRows: [],
  staffById: new Map(),
  readFailures: [],
};

/** Field-relevant columns only. No unit_price/total_price/*_cost/discount/vat/cost_notes. */
const PRODUCT_COLUMNS =
  'id, booking_id, name, quantity, notes, parent_product_id, parent_package_id, is_package_component, inventory_package_id, package_components, sort_index, source_missing_since';

export async function readWorkOrderSources(scope: WorkOrderReadScope): Promise<WorkOrderSourceBundle> {
  const { admin, organizationId, staffId } = scope;
  const bookingIds = [...new Set(scope.bookingIds)];
  const projectIds = [...new Set(scope.projectIds)];
  const dates = [...new Set(scope.dates)];
  if (bookingIds.length === 0) return EMPTY;

  const failures: string[] = [];
  const run = async <T>(table: string, query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await query;
      if (error) {
        failures.push(table);
        return [];
      }
      return data ?? [];
    } catch {
      failures.push(table);
      return [];
    }
  };

  const assignedFilter = `assigned_to_ids.cs.{${staffId}},assigned_to.eq.${staffId}`;

  const [products, calendarPhases, attachments, projectFiles, establishmentTasks, projectTasks, teamRows] =
    await Promise.all([
      run<WorkOrderProductRow>('booking_products', admin
        .from('booking_products')
        .select(PRODUCT_COLUMNS)
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds)
        .is('source_missing_since', null)),
      run<WorkOrderCalendarPhaseRow>('calendar_events', admin
        .from('calendar_events')
        .select('id, booking_id, event_type, start_time, end_time')
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds)
        .in('event_type', ['rig', 'event', 'rigDown'])),
      run<WorkOrderFileRow>('booking_attachments', admin
        .from('booking_attachments')
        .select('id, booking_id, url, file_name, file_type')
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds)),
      projectIds.length
        ? run<WorkOrderFileRow>('project_files', admin
          .from('project_files')
          .select('id, project_id, url, file_name, file_type')
          .eq('organization_id', organizationId)
          .in('project_id', projectIds))
        : Promise.resolve([] as WorkOrderFileRow[]),
      // Legacy Time rule mirrored exactly: only activities explicitly marked
      // visible_in_time_app AND assigned to the requesting worker.
      run<WorkOrderEstablishmentTaskRow>('establishment_tasks', admin
        .from('establishment_tasks')
        .select('id, booking_id, title, completed, status, notes, assigned_to, assigned_to_ids, visible_in_time_app, sort_order')
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds)
        .eq('visible_in_time_app', true)
        .or(assignedFilter)),
      projectIds.length
        ? run<WorkOrderProjectTaskRow>('project_tasks', admin
          .from('project_tasks')
          .select('id, project_id, title, description, completed, is_info_only, assigned_to, assigned_to_ids, sort_order')
          .eq('organization_id', organizationId)
          .in('project_id', projectIds)
          .or(assignedFilter))
        : Promise.resolve([] as WorkOrderProjectTaskRow[]),
      dates.length
        ? run<WorkOrderTeamRow>('booking_staff_assignments', admin
          .from('booking_staff_assignments')
          .select('booking_id, staff_id, assignment_date, team_id')
          .eq('organization_id', organizationId)
          .in('booking_id', bookingIds)
          .in('assignment_date', dates))
        : Promise.resolve([] as WorkOrderTeamRow[]),
    ]);

  const staffIds = [...new Set([
    ...teamRows.map((row) => String(row.staff_id)),
    ...scope.leaderRefs,
  ])].filter((id) => id && id !== staffId);
  const staffRows = staffIds.length
    ? await run<WorkOrderStaffRow>('staff_members', admin
      .from('staff_members')
      .select('id, name, role, phone')
      .eq('organization_id', organizationId)
      .in('id', staffIds))
    : [];

  return {
    products,
    calendarPhases,
    attachments,
    projectFiles,
    establishmentTasks,
    projectTasks,
    teamRows,
    staffById: new Map(staffRows.map((row) => [String(row.id), row])),
    readFailures: failures,
  };
}
