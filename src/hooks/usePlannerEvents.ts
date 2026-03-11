/**
 * ============================================================
 * usePlannerEvents — Unified Event Access Hook
 * ============================================================
 * 
 * A convenience hook that wraps existing event source hooks and
 * exposes their data as normalized PlannerEvent arrays.
 * 
 * This hook does NOT replace the source hooks — they continue to
 * own data fetching, caching, and real-time subscriptions. This
 * hook simply transforms their output into the canonical shape.
 * 
 * Usage:
 *   const { plannerEvents, isLoading } = usePlannerEvents(calendarEvents);
 * 
 * For components that still need the original shape, use the
 * reverse adapters: toPlanningCalendarEvent(), toWarehouseEvent(), etc.
 * ============================================================
 */

import { useMemo } from 'react';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import type { WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import type { DashboardEvent } from '@/hooks/useDashboardEvents';
import type { PlannerEvent, PlannerEventSource } from '@/types/planner-events';
import {
  fromCalendarEvents,
  fromWarehouseEvents,
  fromDashboardEvents,
} from '@/adapters/planner-event-adapters';

interface UsePlannerEventsOptions {
  /** Planning calendar events (from useCalendarEvents / useRealTimeCalendarEvents) */
  calendarEvents?: CalendarEvent[];
  /** Warehouse events (from useWarehouseCalendarEvents) */
  warehouseEvents?: WarehouseEvent[];
  /** Dashboard events (from useDashboardEvents) */
  dashboardEvents?: DashboardEvent[];
  /** Filter by source (optional — returns all sources by default) */
  filterSources?: PlannerEventSource[];
}

export function usePlannerEvents({
  calendarEvents = [],
  warehouseEvents = [],
  dashboardEvents = [],
  filterSources,
}: UsePlannerEventsOptions) {
  const plannerEvents = useMemo<PlannerEvent[]>(() => {
    const all: PlannerEvent[] = [
      ...fromCalendarEvents(calendarEvents),
      ...fromWarehouseEvents(warehouseEvents),
      ...fromDashboardEvents(dashboardEvents),
    ];

    if (filterSources && filterSources.length > 0) {
      return all.filter(e => filterSources.includes(e.source));
    }

    return all;
  }, [calendarEvents, warehouseEvents, dashboardEvents, filterSources]);

  return { plannerEvents };
}

/**
 * Utility to filter PlannerEvents by category.
 */
export function filterByCategory(events: PlannerEvent[], category: PlannerEvent['category']): PlannerEvent[] {
  return events.filter(e => e.category === category);
}

/**
 * Utility to group PlannerEvents by date key (yyyy-MM-dd).
 */
export function groupByDate(events: PlannerEvent[]): Record<string, PlannerEvent[]> {
  return events.reduce((acc, event) => {
    const dateKey = event.start.slice(0, 10); // yyyy-MM-dd from ISO string
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, PlannerEvent[]>);
}

/**
 * Utility to group PlannerEvents by booking ID.
 */
export function groupByBooking(events: PlannerEvent[]): Record<string, PlannerEvent[]> {
  return events.reduce((acc, event) => {
    const key = event.bookingId || event.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {} as Record<string, PlannerEvent[]>);
}
