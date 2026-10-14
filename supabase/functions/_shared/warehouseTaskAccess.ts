type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error?: unknown };
interface Query extends PromiseLike<Result<Row[]>> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  limit(count: number): Query;
  maybeSingle(): PromiseLike<Result<Row>>;
}
export interface WarehouseTaskDatabase { from(table: string): Query }

/** Completion follows concrete warehouse ownership for linked planned tasks.
 * Legacy unlinked tasks retain their explicit project-task assignees. */
export async function canCompleteWarehouseTask(db: WarehouseTaskDatabase, organizationId: string, staffId: string, taskId: string): Promise<boolean> {
  const { data: task, error: taskError } = await db.from('project_tasks')
    .select('id, project_id, assigned_to, assigned_to_ids').eq('organization_id', organizationId).eq('id', taskId).maybeSingle();
  if (taskError) throw taskError;
  if (!task) return false;
  const { data: project, error: projectError } = await db.from('projects')
    .select('id').eq('organization_id', organizationId).eq('id', task.project_id).eq('is_internal', true).maybeSingle();
  if (projectError) throw projectError;
  if (!project) return false;
  // '*' permits deployment before the new optional column exists.
  const { data: events, error: eventError } = await db.from('warehouse_calendar_events')
    .select('*').eq('organization_id', organizationId).eq('event_type', 'internal_task');
  if (eventError) throw eventError;
  const eventIds = (events || []).filter((e) => e.project_task_id === task.id).map((e) => e.id);
  if (!eventIds.length) return task.assigned_to === staffId || (Array.isArray(task.assigned_to_ids) && task.assigned_to_ids.includes(staffId));
  const { data: assignments, error: assignmentError } = await db.from('warehouse_assignments')
    .select('id').eq('organization_id', organizationId).eq('staff_id', staffId)
    .eq('project_task_id', task.id).in('warehouse_event_id', eventIds).limit(1);
  if (assignmentError) throw assignmentError;
  return !!assignments?.length;
}

/** Keep full instants, but place a continuing job on the requested calendar day. */
export function warehouseVisibleDate(startDate: string | null, dateFrom: string, dateTo: string): string | null {
  if (!startDate) return null;
  if (dateFrom > dateTo) throw new Error('Invalid date range');
  return startDate < dateFrom ? dateFrom : startDate;
}
