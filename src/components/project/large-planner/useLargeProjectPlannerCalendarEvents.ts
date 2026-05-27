/**
 * useLargeProjectPlannerCalendarEvents
 * --------------------------------------------------------------------------
 * Mappar large_project_booking_plan_items till CalendarEvent[] så de kan
 * visas i ProjectCalendarView/CustomCalendar (samma UI som personalkalendern).
 *
 * Återanvänder useLargeProjectPlannerItems (React Query dedup).
 * Skriver INGENTING — read-only mapping.
 */
import { useMemo } from 'react';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';

const FALLBACK_START = '08:00:00';
const FALLBACK_END = '16:00:00';

const STATUS_COLOR: Record<string, { bg: string; border: string }> = {
  planned: { bg: '#EDE9FE', border: '#8B5CF6' },
  in_progress: { bg: '#DDD6FE', border: '#7C3AED' },
  done: { bg: '#D1FAE5', border: '#10B981' },
  blocked: { bg: '#FEE2E2', border: '#EF4444' },
  unplanned: { bg: '#F5F3FF', border: '#C4B5FD' },
};

export function useLargeProjectPlannerCalendarEvents(
  largeProjectId: string | null | undefined,
) {
  const { items, itemsWithAssignmentValidity, isLoading, refetch } =
    useLargeProjectPlannerItems(largeProjectId);

  const events: CalendarEvent[] = useMemo(() => {
    const source = itemsWithAssignmentValidity.length ? itemsWithAssignmentValidity : items;
    return source.map((it) => {
      const startTime = (it.start_time || FALLBACK_START).slice(0, 8);
      const endTime = (it.end_time || FALLBACK_END).slice(0, 8);
      const start = `${it.plan_date}T${startTime}`;
      const end = `${it.plan_date}T${endTime}`;
      const tone = STATUS_COLOR[it.status] ?? STATUS_COLOR.planned;
      return {
        id: `planner-item-${it.id}`,
        title: it.title,
        start,
        end,
        resourceId: 'team-tasks',
        eventType: 'internal_task',
        backgroundColor: tone.bg,
        borderColor: tone.border,
        extendedProps: {
          isPlannerItem: true,
          plannerItemId: it.id,
          bookingId: it.booking_id,
          assignedStaffId: it.assigned_staff_id,
          status: it.status,
          itemType: it.item_type,
          usesFallbackTime: !it.start_time || !it.end_time,
        },
      } as unknown as CalendarEvent;
    });
  }, [items, itemsWithAssignmentValidity]);

  return { events, isLoading, refetch };
}
