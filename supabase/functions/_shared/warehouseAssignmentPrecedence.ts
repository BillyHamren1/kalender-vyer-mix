import { warehousePlanningDate } from './warehousePlanningTime.ts';
import { isWarehouseTeam } from './warehouseTeam.ts';

type AssignmentScope = {
  assignment_date: string | null;
  warehouse_event_id: string | null;
  metadata?: Record<string, unknown> | null;
};
type EventScope = { start_time: string | null; resource_id: string | null };

const key = (date: string, team: string) => `${date}::${team}`;

/**
 * Concrete staffing replaces inferred team jobs only within its own day/team.
 * Include cancelled rows: removing the last job must not resurrect it through
 * the compatibility team placement. All input rows must already be scoped to
 * the authenticated staff and organization.
 */
export function warehouseAssignmentScopes(
  rows: AssignmentScope[],
  events: Map<string, EventScope>,
): Set<string> {
  const scopes = new Set<string>();
  const add = (date: string | null, team: unknown) => {
    if (date && typeof team === 'string' && isWarehouseTeam(team)) scopes.add(key(date, team));
  };
  for (const row of rows) {
    add(row.assignment_date, row.metadata?.resource_id);
    add(row.assignment_date, row.metadata?.mirrored_team_id);
    const event = row.warehouse_event_id ? events.get(row.warehouse_event_id) : null;
    if (event?.start_time) {
      add(warehousePlanningDate(event.start_time), event.resource_id);
      add(warehousePlanningDate(event.start_time), row.metadata?.mirrored_team_id);
    }
  }
  return scopes;
}

export function allowsLegacyWarehouseJob(scopes: Set<string>, date: string, team: string): boolean {
  return !scopes.has(key(date, team));
}

/** Multi-rigdown jobs keep their distinct IDs but use the same action as the base type. */
export function warehouseMobileEventType(raw: string | null | undefined): string {
  return (raw || '').toLowerCase().replace(/^(return|inventory|unpacking)_\d{4}-\d{2}-\d{2}$/, '$1');
}
