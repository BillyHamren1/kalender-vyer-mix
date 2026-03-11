/**
 * ============================================================
 * UNIFIED PLANNER EVENT MODEL (Internal Stabilization Layer)
 * ============================================================
 * 
 * This file defines a single, canonical event shape used internally
 * by the Planner module after data has been fetched from any source.
 * 
 * IMPORTANT: This does NOT replace external API contracts, database
 * schemas, or backend return types. It is a client-side normalization
 * layer only. All original data is preserved in `rawOriginalData`.
 * 
 * Sources adapted:
 *   1. CalendarEvent   (src/components/Calendar/ResourceData.ts)
 *   2. WarehouseEvent  (src/hooks/useWarehouseCalendarEvents.tsx)
 *   3. DashboardEvent  (src/hooks/useDashboardEvents.ts)
 * ============================================================
 */

/** Discriminated event source tag — identifies where data originated */
export type PlannerEventSource = 'calendar' | 'warehouse' | 'dashboard' | 'logistics';

/** 
 * Normalized event type taxonomy.
 * Planning types: rig, event, rigDown
 * Warehouse types: packing, delivery, return, inventory, unpacking
 * Dashboard/logistics: transport, unknown
 */
export type PlannerEventType =
  | 'rig'
  | 'event'
  | 'rigDown'
  | 'packing'
  | 'delivery'
  | 'return'
  | 'inventory'
  | 'unpacking'
  | 'transport'
  | 'unknown';

/** Category used for filtering and visual grouping */
export type PlannerEventCategory = 'planning' | 'warehouse' | 'logistics';

/**
 * The canonical internal event shape.
 * Every event in the Planner is normalized to this interface
 * after fetching from its respective source.
 */
export interface PlannerEvent {
  /** Unique event ID (from source) */
  id: string;

  /** Normalized event type */
  type: PlannerEventType;

  /** Display title */
  title: string;

  /** ISO 8601 start timestamp */
  start: string;

  /** ISO 8601 end timestamp */
  end: string;

  /** Whether this is an all-day event */
  allDay: boolean;

  /** Primary resource/team ID this event belongs to */
  resourceId: string | null;

  /** Multiple resource IDs (for multi-resource events) */
  resourceIds: string[];

  /** Associated booking ID (null if standalone event) */
  bookingId: string | null;

  /** Human-readable booking number */
  bookingNumber: string | null;

  /** Event status (e.g. CONFIRMED, active, planned) */
  status: string | null;

  /** High-level category for filtering */
  category: PlannerEventCategory;

  /** CSS color token or hex value for rendering */
  color: string | null;

  /** Whether the event has been viewed/acknowledged */
  viewed: boolean;

  /** Delivery address associated with the event */
  deliveryAddress: string | null;

  /**
   * Flexible metadata bag for source-specific data that doesn't
   * fit the canonical shape but is needed by certain renderers.
   */
  metadata: Record<string, unknown>;

  /** Which system this event was adapted from */
  source: PlannerEventSource;

  /**
   * The raw, unmodified source object. Preserved for compatibility
   * with renderers that still expect the original shape.
   * Typed as `unknown` to prevent accidental direct access without casting.
   */
  rawOriginalData: unknown;
}

/**
 * Helper type for components that need to access the original
 * CalendarEvent shape from a PlannerEvent.
 */
export type PlannerEventWithCalendarRaw = PlannerEvent & {
  rawOriginalData: import('@/components/Calendar/ResourceData').CalendarEvent;
};

/**
 * Helper type for components that need the original WarehouseEvent.
 */
export type PlannerEventWithWarehouseRaw = PlannerEvent & {
  rawOriginalData: import('@/hooks/useWarehouseCalendarEvents').WarehouseEvent;
};
