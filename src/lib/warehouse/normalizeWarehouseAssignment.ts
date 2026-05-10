/**
 * Helper: normalize a warehouse_assignments row (or an equivalent legacy
 * payload from `get_lager_assignments`) into the shape the Time-app UI
 * consumes.
 *
 * Backwards compatible: accepts both the new DB row layout
 * (assignment_type / action / assignment_date / start_time / end_time)
 * and the legacy mobile-API payload (event_type / start_time as ISO).
 */

import {
  DEFAULT_WAREHOUSE_ACTION_BY_TYPE,
  isWarehouseAssignmentType,
  type WarehouseAssignmentAction,
  type WarehouseAssignmentMetadata,
  type WarehouseAssignmentStatus,
  type WarehouseAssignmentType,
} from '@/types/warehouseAssignments';

export interface NormalizedWarehouseAssignment {
  id: string;
  type: WarehouseAssignmentType;
  title: string;
  description: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM[:SS] or full ISO — caller decides how to format */
  start_time: string | null;
  end_time: string | null;
  status: WarehouseAssignmentStatus;
  action: WarehouseAssignmentAction;
  packing_id: string | null;
  packlist_id: string | null;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
  customer_name: string | null;
  project_task_id: string | null;
  metadata: WarehouseAssignmentMetadata;
}

const ALLOWED_STATUSES: WarehouseAssignmentStatus[] = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
  'unknown',
];

const ALLOWED_ACTIONS: WarehouseAssignmentAction[] = [
  'open_scanner',
  'open_return_scanner',
  'open_inventory',
  'complete_task',
  'open_details',
];

const coerceType = (raw: unknown): WarehouseAssignmentType => {
  if (isWarehouseAssignmentType(raw)) return raw;
  // Legacy event_type values from warehouse_calendar_events / mobile API
  if (raw === 'warehouse') return 'other';
  return 'other';
};

const coerceStatus = (raw: unknown, completed?: boolean): WarehouseAssignmentStatus => {
  if (typeof raw === 'string' && (ALLOWED_STATUSES as string[]).includes(raw)) {
    return raw as WarehouseAssignmentStatus;
  }
  if (completed) return 'completed';
  if (raw === 'open' || raw === 'scheduled') return 'planned';
  return 'unknown';
};

const coerceAction = (
  raw: unknown,
  type: WarehouseAssignmentType,
): WarehouseAssignmentAction => {
  if (typeof raw === 'string' && (ALLOWED_ACTIONS as string[]).includes(raw)) {
    return raw as WarehouseAssignmentAction;
  }
  return DEFAULT_WAREHOUSE_ACTION_BY_TYPE[type];
};

const extractDate = (row: any): string | null => {
  const direct =
    row?.assignment_date ?? row?.date ?? row?.report_date ?? null;
  if (typeof direct === 'string' && direct.length >= 10) return direct.slice(0, 10);
  const start = row?.start_time;
  if (typeof start === 'string' && start.length >= 10) return start.slice(0, 10);
  return null;
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

/**
 * Normalize a single row.  Returns `null` if the row does not have an `id`.
 */
export function normalizeWarehouseAssignment(
  row: any,
): NormalizedWarehouseAssignment | null {
  if (!row || typeof row !== 'object') return null;
  const id = str(row.id);
  if (!id) return null;

  const type = coerceType(row.assignment_type ?? row.type ?? row.event_type);
  const status = coerceStatus(row.status, !!row.completed);
  const action = coerceAction(row.action, type);

  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as WarehouseAssignmentMetadata)
      : {};

  return {
    id,
    type,
    title: str(row.title) ?? 'Lageruppgift',
    description: str(row.description),
    date: extractDate(row),
    start_time: str(row.start_time),
    end_time: str(row.end_time),
    status,
    action,
    packing_id: str(row.packing_id),
    packlist_id: str(row.packlist_id),
    booking_id: str(row.booking_id),
    booking_number: str(row.booking_number),
    delivery_address: str(row.delivery_address),
    customer_name: str(row.customer_name) ?? str(row.client_name),
    project_task_id: str(row.project_task_id),
    metadata,
  };
}

/** Normalize a list, dropping rows without an id. */
export function normalizeWarehouseAssignments(
  rows: unknown,
): NormalizedWarehouseAssignment[] {
  if (!Array.isArray(rows)) return [];
  const out: NormalizedWarehouseAssignment[] = [];
  for (const r of rows) {
    const n = normalizeWarehouseAssignment(r);
    if (n) out.push(n);
  }
  return out;
}
