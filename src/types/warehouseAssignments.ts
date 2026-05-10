/**
 * Warehouse Assignments - Normalized model for the Time-app "Lager" view.
 *
 * Architectural principle:
 * - "Lager" is treated as a single internal large-project in the Time-app.
 * - Personnel scheduling answers only: "Should this person work at Lager today?"
 *   (driven by staff_assignments + warehouse calendar events / project membership).
 * - Detailed warehouse assignments answer: "What exactly should they do at Lager?"
 *   (this file's normalized model on top of packing_projects, returns,
 *   inventories, project_tasks, etc).
 *
 * These two levels MUST NOT be conflated. This module is purely a typed
 * normalized view layer — it does not replace existing data sources, and is
 * fully backwards compatible.
 */

/** What kind of warehouse work the assignment represents. */
export type WarehouseAssignmentType =
  | 'packing'
  | 'return'
  | 'inventory'
  | 'internal_task'
  | 'other';

/** What the primary CTA should do when the user taps the assignment card. */
export type WarehouseAssignmentAction =
  | 'open_scanner'
  | 'open_return_scanner'
  | 'open_inventory'
  | 'complete_task'
  | 'open_details';

/** Lifecycle status for a normalized warehouse assignment row. */
export type WarehouseAssignmentStatus =
  | 'planned'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'unknown';

/**
 * Where the assignment originates from. Used for debugging and to let the UI
 * fall back gracefully when one source is missing.
 */
export type WarehouseAssignmentSource =
  | 'packing_project'
  | 'return_flow'
  | 'inventory_session'
  | 'project_task'
  | 'warehouse_calendar_event'
  | 'manual'
  | 'other';

/**
 * Free-form metadata bag — kept loose on purpose so existing call sites can
 * pass through extra fields without breaking the contract.
 */
export type WarehouseAssignmentMetadata = Record<string, unknown>;

/**
 * Normalized warehouse assignment used by the Time-app Lager-view.
 *
 * All ID fields are nullable because a single assignment might originate from
 * different underlying tables (packing, returns, project_tasks, manual, ...).
 * Consumers should rely on `assignment_type` + `action` to know what to do.
 */
export interface WarehouseAssignment {
  /** Stable id for this normalized row (may be derived from source row id). */
  id: string;

  organization_id: string;
  staff_id: string;

  /** ISO date (YYYY-MM-DD) the assignment is scheduled for. */
  assignment_date: string;

  title: string;
  description: string | null;

  assignment_type: WarehouseAssignmentType;
  action: WarehouseAssignmentAction;
  status: WarehouseAssignmentStatus;

  /** ISO timestamp or null if no specific time window. */
  start_time: string | null;
  end_time: string | null;

  // --- Linkage to underlying domain rows (all optional) ---

  /** Linked warehouse calendar event (if scheduled on the warehouse calendar). */
  warehouse_event_id: string | null;

  /** Linked packing_project / packing job id. */
  packing_id: string | null;

  /** Linked packlist id (when distinct from packing project). */
  packlist_id: string | null;

  /** Linked external booking id (if work originates from a booking). */
  booking_id: string | null;

  /** Human-readable booking number (mirrored from booking system). */
  booking_number: string | null;

  /** Delivery / pickup address used by the Time-app card. */
  delivery_address: string | null;

  /** Customer / project name used as secondary line on the card. */
  customer_name: string | null;

  /** Linked project_task id when the assignment is an internal task. */
  project_task_id: string | null;

  /** Where this normalized row was derived from. */
  source: WarehouseAssignmentSource;

  /** Loose extension bag for source-specific fields. */
  metadata: WarehouseAssignmentMetadata;
}

/**
 * Per-day grouping returned to the Time-app. The Lager-card in the day view
 * shows summary info; tapping it navigates into the detailed list.
 */
export interface WarehouseAssignmentDay {
  staff_id: string;
  organization_id: string;
  assignment_date: string;

  /** True when staff is scheduled for Lager this day (planning level). */
  isAssignedToWarehouse: boolean;

  /** Detailed assignments for the day (operational level). */
  assignments: WarehouseAssignment[];

  /** Convenience counts for the summary card. */
  counts: {
    total: number;
    planned: number;
    in_progress: number;
    completed: number;
    byType: Partial<Record<WarehouseAssignmentType, number>>;
  };
}

/**
 * Default action for a given assignment type. Helpers can use this when an
 * upstream record does not specify the action explicitly.
 */
export const DEFAULT_WAREHOUSE_ACTION_BY_TYPE: Record<
  WarehouseAssignmentType,
  WarehouseAssignmentAction
> = {
  packing: 'open_scanner',
  return: 'open_return_scanner',
  inventory: 'open_inventory',
  internal_task: 'complete_task',
  other: 'open_details',
};

/** Type guard helper. */
export const isWarehouseAssignmentType = (
  value: unknown,
): value is WarehouseAssignmentType =>
  value === 'packing' ||
  value === 'return' ||
  value === 'inventory' ||
  value === 'internal_task' ||
  value === 'other';
