/**
 * Warehouse calendar display helpers.
 *
 * The legacy technical team model (`lager-1`, `lager-2`, ... `transport`)
 * stays intact in the database, in `staff_assignments` and in every
 * compatibility path. It must NOT leak into the user interface:
 * the planner sees "Lager" (activities by date/time) and "Personal"
 * (work grouped per actual person) — never "Lager 1 / Lager 2 / Lager 3".
 *
 * These helpers are pure so they can be unit tested without the calendar.
 */
import type { Resource } from '@/components/Calendar/ResourceData';

/** The two top-level modes of the warehouse planning surface. */
export type WarehousePlanningMode = 'calendar' | 'personnel';

/** UI label for any legacy lager-N column. Never shows the number. */
export const WAREHOUSE_COLUMN_LABEL = 'Lager' as const;

export const isLegacyLagerResourceId = (id: string | null | undefined): boolean =>
  !!id && id.startsWith('lager-');

/**
 * Strips the legacy team numbering from resource titles while keeping the
 * technical ids untouched (drag/drop, staff_assignments and warehouse
 * calendar writes all still resolve to the same `lager-N` id).
 */
export const toDisplayResources = (resources: Resource[]): Resource[] =>
  resources.map((resource) =>
    isLegacyLagerResourceId(resource.id)
      ? { ...resource, title: WAREHOUSE_COLUMN_LABEL }
      : resource,
  );
