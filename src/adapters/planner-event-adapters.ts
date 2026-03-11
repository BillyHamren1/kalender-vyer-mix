/**
 * ============================================================
 * PLANNER EVENT ADAPTERS (Internal Stabilization Layer)
 * ============================================================
 * 
 * Pure transformer functions that convert each event source into
 * the canonical PlannerEvent shape. These are the ONLY place where
 * source-specific format differences (date formats, field names,
 * missing fields) are resolved.
 * 
 * RULES:
 *   - No side effects (pure functions only)
 *   - No database calls
 *   - Original data always preserved in rawOriginalData
 *   - Date/time normalization happens HERE, not in renderers
 * 
 * Sources:
 *   1. fromCalendarEvent     — CalendarEvent (ResourceData.ts)
 *   2. fromWarehouseEvent    — WarehouseEvent (useWarehouseCalendarEvents.tsx)
 *   3. fromDashboardEvent    — DashboardEvent (useDashboardEvents.ts)
 * ============================================================
 */

import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import { getEventColor } from '@/components/Calendar/ResourceData';
import type { WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import type { DashboardEvent } from '@/hooks/useDashboardEvents';
import type {
  PlannerEvent,
  PlannerEventType,
  PlannerEventCategory,
} from '@/types/planner-events';

// ─── Helpers ───────────────────────────────────────────────

/**
 * Safely normalize an event_type string into our canonical PlannerEventType.
 * Handles casing inconsistencies (e.g. "Rigg" vs "rig", "RigDown" vs "rigDown").
 */
function normalizeEventType(raw: string | undefined | null): PlannerEventType {
  if (!raw) return 'unknown';

  const lower = raw.toLowerCase().trim();

  // Planning types
  if (lower === 'rig' || lower === 'rigg') return 'rig';
  if (lower === 'event' || lower === 'evenemang') return 'event';
  if (lower === 'rigdown' || lower === 'rig_down' || lower === 'retur (rigg)') return 'rigDown';

  // Warehouse types
  if (lower === 'packing' || lower === 'packning') return 'packing';
  if (lower === 'delivery' || lower === 'leverans') return 'delivery';
  if (lower === 'return' || lower === 'retur') return 'return';
  if (lower === 'inventory' || lower === 'inventering') return 'inventory';
  if (lower === 'unpacking' || lower === 'uppackning') return 'unpacking';

  // Logistics
  if (lower === 'transport') return 'transport';

  return 'unknown';
}

/**
 * Derive PlannerEventCategory from a normalized PlannerEventType.
 */
function categoryFromType(type: PlannerEventType): PlannerEventCategory {
  switch (type) {
    case 'rig':
    case 'event':
    case 'rigDown':
      return 'planning';
    case 'packing':
    case 'delivery':
    case 'return':
    case 'inventory':
    case 'unpacking':
      return 'warehouse';
    case 'transport':
      return 'logistics';
    default:
      return 'planning'; // Default to planning for unknown types
  }
}

/**
 * Ensure a timestamp is ISO 8601 format.
 * Handles edge case where some sources provide date-only strings.
 */
function ensureISO(value: string | Date | undefined | null, fallback: string = new Date().toISOString()): string {
  if (!value) return fallback;
  if (value instanceof Date) return value.toISOString();
  // Already an ISO string
  if (typeof value === 'string' && value.includes('T')) return value;
  // Date-only string (yyyy-MM-dd) — treat as start of day UTC
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  return value;
}

// ─── Adapter: CalendarEvent → PlannerEvent ─────────────────

/**
 * Transforms a CalendarEvent (planning calendar) into a PlannerEvent.
 * 
 * CalendarEvent extends FullCalendar's EventInput and has fields like:
 *   id, title, start, end, resourceId, bookingId, eventType, extendedProps, etc.
 */
export function fromCalendarEvent(event: CalendarEvent): PlannerEvent {
  const type = normalizeEventType(event.eventType);

  return {
    id: event.id,
    type,
    title: event.title || '',
    start: ensureISO(event.start),
    end: ensureISO(event.end, ensureISO(event.start)),
    allDay: false,
    resourceId: event.resourceId || null,
    resourceIds: event.resourceId ? [event.resourceId] : [],
    bookingId: event.bookingId || event.extendedProps?.booking_id || null,
    bookingNumber: event.bookingNumber || event.booking_number || event.extendedProps?.bookingNumber || null,
    status: null,
    category: categoryFromType(type),
    color: getEventColor(event.eventType) || null,
    viewed: event.viewed ?? true,
    deliveryAddress: event.deliveryAddress || event.extendedProps?.deliveryAddress || null,
    metadata: {
      // Preserve all extendedProps for renderers that need them
      ...(event.extendedProps || {}),
      deliveryCity: event.extendedProps?.deliveryCity || event.extendedProps?.delivery_city || null,
      hasSourceChanges: event.extendedProps?.has_source_changes || false,
      manuallyAdjusted: event.extendedProps?.manually_adjusted || false,
    },
    source: 'calendar',
    rawOriginalData: event,
  };
}

/**
 * Batch adapter: converts an array of CalendarEvents.
 */
export function fromCalendarEvents(events: CalendarEvent[]): PlannerEvent[] {
  return events.map(fromCalendarEvent);
}

// ─── Adapter: WarehouseEvent → PlannerEvent ────────────────

/**
 * Transforms a WarehouseEvent into a PlannerEvent.
 * 
 * WarehouseEvent uses snake_case fields and has warehouse-specific
 * metadata like source_rig_date, has_source_changes, manually_adjusted.
 */
export function fromWarehouseEvent(event: WarehouseEvent): PlannerEvent {
  const type = normalizeEventType(event.event_type);

  return {
    id: event.id,
    type,
    title: event.title || '',
    start: ensureISO(event.start_time),
    end: ensureISO(event.end_time, ensureISO(event.start_time)),
    allDay: false,
    resourceId: event.resource_id || null,
    resourceIds: event.resource_id ? [event.resource_id] : [],
    bookingId: event.booking_id || null,
    bookingNumber: event.booking_number || null,
    status: null,
    category: 'warehouse',
    color: getEventColor(type) || null,
    viewed: event.viewed ?? false,
    deliveryAddress: event.delivery_address || null,
    metadata: {
      sourceRigDate: event.source_rig_date,
      sourceEventDate: event.source_event_date,
      sourceRigdownDate: event.source_rigdown_date,
      hasSourceChanges: event.has_source_changes,
      changeDetails: event.change_details,
      manuallyAdjusted: event.manually_adjusted,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    },
    source: 'warehouse',
    rawOriginalData: event,
  };
}

/**
 * Batch adapter: converts an array of WarehouseEvents.
 */
export function fromWarehouseEvents(events: WarehouseEvent[]): PlannerEvent[] {
  return events.map(fromWarehouseEvent);
}

// ─── Adapter: DashboardEvent → PlannerEvent ────────────────

/**
 * Transforms a DashboardEvent into a PlannerEvent.
 * 
 * DashboardEvent uses a Date object for `date` (not ISO string),
 * has `category` and `assignedStaff` which are dashboard-specific.
 * It represents grouped/aggregated events (one card per booking).
 */
export function fromDashboardEvent(event: DashboardEvent): PlannerEvent {
  const type = normalizeEventType(event.eventType);
  const dateISO = event.date instanceof Date ? event.date.toISOString() : ensureISO(String(event.date));

  return {
    id: event.id,
    type,
    title: event.client || '',
    start: dateISO,
    end: dateISO, // Dashboard events are date-level, no end time
    allDay: true, // Dashboard events are displayed at day level
    resourceId: null,
    resourceIds: [],
    bookingId: event.bookingId || null,
    bookingNumber: event.bookingNumber || null,
    status: event.status || null,
    category: event.category as PlannerEventCategory,
    color: null, // Dashboard uses its own color system
    viewed: true,
    deliveryAddress: event.deliveryAddress || null,
    metadata: {
      assignedStaff: event.assignedStaff || [],
      originalEventType: event.eventType, // May contain comma-separated types like "rig, event"
    },
    source: 'dashboard',
    rawOriginalData: event,
  };
}

/**
 * Batch adapter: converts an array of DashboardEvents.
 */
export function fromDashboardEvents(events: DashboardEvent[]): PlannerEvent[] {
  return events.map(fromDashboardEvent);
}

// ─── Reverse Adapters (Compatibility Layer) ────────────────

/**
 * Converts a PlannerEvent back to the CalendarEvent shape expected
 * by legacy renderers. Uses rawOriginalData when available for full
 * fidelity, otherwise reconstructs from normalized fields.
 * 
 * This is the COMPATIBILITY LAYER for components that haven't been
 * migrated to consume PlannerEvent directly.
 */
export function toPlanningCalendarEvent(pe: PlannerEvent): CalendarEvent {
  // If we have the original, return it directly for maximum compatibility
  if (pe.source === 'calendar' && pe.rawOriginalData) {
    return pe.rawOriginalData as CalendarEvent;
  }

  // Otherwise reconstruct from normalized fields
  return {
    id: pe.id,
    title: pe.title,
    start: pe.start,
    end: pe.end,
    resourceId: pe.resourceId || '',
    bookingId: pe.bookingId || undefined,
    bookingNumber: pe.bookingNumber || undefined,
    eventType: pe.type as CalendarEvent['eventType'],
    deliveryAddress: pe.deliveryAddress || undefined,
    viewed: pe.viewed,
    extendedProps: {
      ...(pe.metadata as Record<string, any>),
      booking_id: pe.bookingId,
      bookingNumber: pe.bookingNumber,
    },
  };
}

/**
 * Converts a PlannerEvent back to WarehouseEvent shape for legacy renderers.
 */
export function toWarehouseEvent(pe: PlannerEvent): WarehouseEvent {
  if (pe.source === 'warehouse' && pe.rawOriginalData) {
    return pe.rawOriginalData as WarehouseEvent;
  }

  // Reconstruct (best-effort)
  return {
    id: pe.id,
    booking_id: pe.bookingId || '',
    booking_number: pe.bookingNumber || null,
    title: pe.title,
    start_time: pe.start,
    end_time: pe.end,
    resource_id: pe.resourceId || '',
    event_type: pe.type as any,
    delivery_address: pe.deliveryAddress || null,
    source_rig_date: (pe.metadata.sourceRigDate as string) || null,
    source_event_date: (pe.metadata.sourceEventDate as string) || null,
    source_rigdown_date: (pe.metadata.sourceRigdownDate as string) || null,
    has_source_changes: (pe.metadata.hasSourceChanges as boolean) || false,
    change_details: (pe.metadata.changeDetails as string) || null,
    manually_adjusted: (pe.metadata.manuallyAdjusted as boolean) || false,
    viewed: pe.viewed,
    created_at: (pe.metadata.createdAt as string) || '',
    updated_at: (pe.metadata.updatedAt as string) || '',
  };
}

/**
 * Converts a PlannerEvent back to DashboardEvent shape for legacy renderers.
 */
export function toDashboardEvent(pe: PlannerEvent): DashboardEvent {
  if (pe.source === 'dashboard' && pe.rawOriginalData) {
    return pe.rawOriginalData as DashboardEvent;
  }

  return {
    id: pe.id,
    bookingId: pe.bookingId || '',
    bookingNumber: pe.bookingNumber || null,
    client: pe.title,
    date: new Date(pe.start),
    eventType: pe.metadata.originalEventType as string || pe.type,
    category: pe.category as DashboardEvent['category'],
    assignedStaff: (pe.metadata.assignedStaff as DashboardEvent['assignedStaff']) || [],
    status: pe.status || undefined,
    deliveryAddress: pe.deliveryAddress,
  };
}
