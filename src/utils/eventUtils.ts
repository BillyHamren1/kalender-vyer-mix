/**
 * ============================================================
 * EVENT UTILITIES — Identity, Dedup, and Comparison
 * ============================================================
 * 
 * Centralized helpers for stable event keys, deduplication,
 * and shallow comparison. Used across all planner views to
 * prevent duplicate rendering and ensure stable React keys.
 * ============================================================
 */

import { CalendarEvent } from '@/components/Calendar/ResourceData';

// ─── Stable Key Generation ────────────────────────────────

/**
 * Generates a stable, unique key for a CalendarEvent.
 * Combines id + resourceId to handle multi-resource events
 * that share the same id but render in different columns.
 * 
 * STABILIZATION: Prevents React key collisions when the same
 * booking generates events across multiple resources.
 */
export function getEventKey(event: CalendarEvent): string {
  return `${event.id}-${event.resourceId}`;
}

/**
 * Generates a composite identity string for dedup comparison.
 * Two events with the same identity are considered duplicates.
 */
export function getEventIdentity(event: CalendarEvent): string {
  return `${event.id}|${event.resourceId}|${event.start}|${event.end}`;
}

// ─── Deduplication ─────────────────────────────────────────

/**
 * Removes duplicate events based on identity.
 * O(n) using a Set for constant-time lookups.
 * 
 * STABILIZATION: Guards against duplicate events from:
 * - Multiple fetch cycles returning overlapping data
 * - Real-time subscriptions delivering already-present events
 * - Concurrent sync operations
 */
export function deduplicateEvents<T extends CalendarEvent>(events: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  
  for (const event of events) {
    const identity = getEventIdentity(event);
    if (!seen.has(identity)) {
      seen.add(identity);
      result.push(event);
    }
  }
  
  return result;
}

// ─── Shallow Comparison ────────────────────────────────────

/**
 * Fast shallow equality check for event arrays.
 * Returns true if both arrays have the same events in the same order
 * (by identity string). Used to skip re-processing when events haven't changed.
 */
export function eventsEqual(a: CalendarEvent[], b: CalendarEvent[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].start !== b[i].start || a[i].end !== b[i].end) {
      return false;
    }
  }
  
  return true;
}

// ─── Filtering ─────────────────────────────────────────────

/**
 * Filters events for a specific resource and date.
 * Extracted from positionEvents to allow memoization at a higher level.
 */
export function filterEventsByResourceAndDate(
  events: CalendarEvent[],
  resourceId: string,
  dateStr: string
): CalendarEvent[] {
  return events.filter(ev => {
    if (ev.resourceId !== resourceId) return false;
    const start = new Date(ev.start);
    const evDate = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
    return evDate === dateStr;
  });
}

// ─── Safe Accessors ────────────────────────────────────────

/**
 * Safely extracts display data from an event, with fallbacks
 * for incomplete data. Prevents crashes when events lack fields.
 * 
 * STABILIZATION: Single place for fallback logic instead of
 * scattered null checks across render components.
 */
export function getEventDisplayData(event: CalendarEvent) {
  const rawBookingId = event.bookingNumber 
    || event.extendedProps?.bookingNumber 
    || event.extendedProps?.booking_id 
    || '';
  
  return {
    title: event.title || 'Untitled',
    bookingNumber: rawBookingId.length > 20 ? rawBookingId.slice(-8) : rawBookingId,
    deliveryCity: event.extendedProps?.deliveryCity 
      || event.extendedProps?.delivery_city 
      || '',
    hasSourceChanges: event.extendedProps?.has_source_changes === true 
      && event.extendedProps?.manually_adjusted !== true,
    eventType: event.eventType || 'unknown',
    bookingId: event.bookingId || event.extendedProps?.booking_id || null,
  };
}

/**
 * Maps events into a Map keyed by date string (yyyy-MM-dd).
 * O(n) single pass. Reusable across month and week views.
 */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  
  for (const ev of events) {
    const start = new Date(ev.start);
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
    const arr = map.get(key);
    if (arr) {
      arr.push(ev);
    } else {
      map.set(key, [ev]);
    }
  }
  
  return map;
}
