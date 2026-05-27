/**
 * useLargeProjectPlannerCalendarEvents
 * --------------------------------------------------------------------------
 * Mappar large_project_booking_plan_items till CalendarEvent[] så de kan
 * visas i ProjectCalendarView/CustomCalendar (samma UI som personalkalendern).
 *
 * Berikar varje event med projekt-namn + projektnummer så att hover-popovern
 * visar "Lastning på lager / Projekt: <namn> / #<projektnr>" istället för
 * "Unknown Client / Unknown City".
 *
 * Read-only mapping — skriver ingenting.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import { supabase } from '@/integrations/supabase/client';
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

interface LargeProjectMeta {
  name: string | null;
  projectNumber: string | null;
}

async function fetchLargeProjectMeta(id: string): Promise<LargeProjectMeta> {
  const { data, error } = await supabase
    .from('large_projects')
    .select('name, project_number')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return {
    name: (data?.name as string | null) ?? null,
    projectNumber: (data?.project_number as string | null) ?? null,
  };
}

export function useLargeProjectPlannerCalendarEvents(
  largeProjectId: string | null | undefined,
) {
  const { items, itemsWithAssignmentValidity, bookings, isLoading, refetch } =
    useLargeProjectPlannerItems(largeProjectId);

  const projectMetaQuery = useQuery({
    queryKey: ['large-project-meta', largeProjectId ?? 'none'],
    queryFn: () => fetchLargeProjectMeta(largeProjectId as string),
    enabled: !!largeProjectId,
  });

  const bookingById = useMemo(() => {
    const map = new Map<string, (typeof bookings)[number]>();
    bookings.forEach((b) => map.set(b.id, b));
    return map;
  }, [bookings]);

  const events: CalendarEvent[] = useMemo(() => {
    const source = itemsWithAssignmentValidity.length ? itemsWithAssignmentValidity : items;
    const projectName = projectMetaQuery.data?.name ?? null;
    const projectNumber = projectMetaQuery.data?.projectNumber ?? null;

    return source.map((it) => {
      const startTime = (it.start_time || FALLBACK_START).slice(0, 8);
      const endTime = (it.end_time || FALLBACK_END).slice(0, 8);
      const start = `${it.plan_date}T${startTime}`;
      const end = `${it.plan_date}T${endTime}`;
      const tone = STATUS_COLOR[it.status] ?? STATUS_COLOR.planned;

      const booking = it.booking_id ? bookingById.get(it.booking_id) ?? null : null;

      // Titeln visas direkt i kalenderblocket. Vi håller den kort men tydlig:
      // "<task>" + projektnamn på radbrytning hanteras av popovern.
      const title = it.title;

      // För hover-popovern: visa projekt som "client" och projektnummer
      // som "bookingNumber" → ger raden "Projekt: <namn>  #<projektnr>".
      const clientLabel = projectName
        ? `Projekt: ${projectName}`
        : 'Internt projekt';
      const numberLabel = projectNumber ?? booking?.booking_number ?? null;

      return {
        id: `planner-item-${it.id}`,
        title,
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
          // Berika popovern
          client: clientLabel,
          bookingNumber: numberLabel,
          projectName,
          projectNumber,
          deliveryCity: '',
          city: '',
          sourceBookingNumber: booking?.booking_number ?? null,
          sourceBookingClient: booking?.client ?? null,
        },
      } as unknown as CalendarEvent;
    });
  }, [items, itemsWithAssignmentValidity, bookingById, projectMetaQuery.data]);

  return {
    events,
    isLoading: isLoading || projectMetaQuery.isLoading,
    refetch,
  };
}
