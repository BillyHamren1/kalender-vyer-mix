/**
 * ============================================================
 * useMemoizedEvents — Memoized Event Processing Hook
 * ============================================================
 * 
 * Provides deduplication, filtering, and grouping with built-in
 * memoization so that downstream components only re-render when
 * actual event data changes. Sits between data fetching and
 * rendering to prevent redundant processing.
 * 
 * STABILIZATION: This hook replaces scattered inline filtering
 * and ensures events are processed exactly once per data change.
 * ============================================================
 */

import { useMemo, useRef } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { deduplicateEvents, eventsEqual, groupEventsByDate } from '@/utils/eventUtils';

/**
 * Core hook: deduplicates and stabilizes an event array reference.
 * Only returns a new array reference when events actually change.
 * 
 * This prevents cascading re-renders in components that depend
 * on event arrays as props or in dependency arrays.
 */
export function useStableEvents(events: CalendarEvent[]): CalendarEvent[] {
  const prevRef = useRef<CalendarEvent[]>([]);
  
  return useMemo(() => {
    const deduped = deduplicateEvents(events);
    
    // Return previous reference if events haven't changed
    // (avoids triggering useMemo/useEffect in consumers)
    if (eventsEqual(prevRef.current, deduped)) {
      return prevRef.current;
    }
    
    prevRef.current = deduped;
    return deduped;
  }, [events]);
}

/**
 * Filters events for a specific resource, with stable reference.
 */
export function useResourceEvents(
  events: CalendarEvent[],
  resourceId: string
): CalendarEvent[] {
  return useMemo(() => {
    return events.filter(ev => ev.resourceId === resourceId);
  }, [events, resourceId]);
}

/**
 * Groups events by date string, memoized.
 */
export function useEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  return useMemo(() => groupEventsByDate(events), [events]);
}

/**
 * Filters events for a specific resource + date, memoized.
 * Used by ResourceColumn to avoid re-computing on every render.
 */
export function useResourceDateEvents(
  events: CalendarEvent[],
  resourceId: string,
  dateStr: string
): CalendarEvent[] {
  return useMemo(() => {
    return events.filter(ev => {
      if (ev.resourceId !== resourceId) return false;
      const start = new Date(ev.start);
      const evDate = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
      return evDate === dateStr;
    });
  }, [events, resourceId, dateStr]);
}
