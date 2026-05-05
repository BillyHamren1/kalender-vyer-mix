/**
 * useProjectTaskCalendarEvents
 * --------------------------------------------------------------------------
 * Hämtar projektets establishment_tasks (via bookingId eller large_project_id)
 * och mappar dem till CalendarEvent-objekt så de kan visas i ProjectCalendarView.
 *
 * Visas i projektkalendern oavsett om de är publicerade till personalkalendern
 * eller inte. En aktivitet med calendar_event_id är "publicerad" — annars
 * markerad som "Endast projekt".
 *
 * Tider:
 *  - start_time / end_time används om satta
 *  - annars fallback 08:00–16:00 på start_date..end_date
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

const FALLBACK_START = '08:00:00';
const FALLBACK_END = '16:00:00';

interface Args {
  bookingId?: string | null;
  largeProjectId?: string | null;
  isLargeProject?: boolean;
  enabled?: boolean;
}

interface RawTask {
  id: string;
  title: string;
  category: string | null;
  status: string | null;
  readiness: string | null;
  task_type: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  due_date: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  assigned_to_ids: string[] | null;
  calendar_event_id: string | null;
  visible_in_time_app?: boolean | null;
  visible_in_project_calendar?: boolean | null;
}

const SELECT =
  'id, title, category, status, readiness, task_type, start_date, end_date, start_time, end_time, due_date, booking_id, large_project_id, assigned_to_ids, calendar_event_id, visible_in_time_app, visible_in_project_calendar';

export function useProjectTaskCalendarEvents({
  bookingId,
  largeProjectId,
  isLargeProject,
  enabled = true,
}: Args) {
  const queryKey = ['project-task-calendar-events', { bookingId, largeProjectId, isLargeProject }];

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey,
    enabled: enabled && (!!bookingId || !!largeProjectId),
    staleTime: 30_000,
    queryFn: async (): Promise<RawTask[]> => {
      if (isLargeProject && largeProjectId) {
        const { data, error } = await supabase
          .from('establishment_tasks')
          .select(SELECT)
          .eq('large_project_id', largeProjectId);
        if (error) throw error;
        return (data || []) as RawTask[];
      }
      if (bookingId) {
        const { data, error } = await supabase
          .from('establishment_tasks')
          .select(SELECT)
          .eq('booking_id', bookingId);
        if (error) throw error;
        return (data || []) as RawTask[];
      }
      return [];
    },
  });

  const events: CalendarEvent[] = useMemo(() => {
    return tasks
      .filter((t) => t.visible_in_project_calendar !== false)
      .map((t) => {
        const startDate = t.start_date || t.due_date;
        const endDate = t.end_date || t.start_date || t.due_date;
        if (!startDate || !endDate) return null;
        const startTime = (t.start_time || FALLBACK_START).slice(0, 8);
        const endTime = (t.end_time || FALLBACK_END).slice(0, 8);
        const start = `${startDate}T${startTime}`;
        const end = `${endDate}T${endTime}`;
        const published = !!t.calendar_event_id;
        const inTimeApp = t.visible_in_time_app === true;
        const missingInfo =
          !t.start_time || !t.end_time || (t.assigned_to_ids?.length ?? 0) === 0;

        return {
          id: `project-task-${t.id}`,
          title: t.title,
          start,
          end,
          resourceId: 'team-tasks',
          eventType: 'internal_task',
          backgroundColor: published ? '#E9D5FF' : '#F5F3FF',
          borderColor: published ? '#A78BFA' : '#C4B5FD',
          extendedProps: {
            isProjectActivity: true,
            taskId: t.id,
            taskType: t.task_type ?? 'crew',
            category: t.category ?? null,
            status: t.status ?? 'todo',
            readiness: t.readiness ?? null,
            assignedIds: t.assigned_to_ids ?? [],
            published,
            publishedTo: published ? 'staff_calendar' : 'project_only',
            inTimeApp,
            missingInfo,
            usesFallbackTime: !t.start_time || !t.end_time,
          },
        } as CalendarEvent;
      })
      .filter(Boolean) as CalendarEvent[];
  }, [tasks]);

  return { events, isLoading, refetch, rawTasks: tasks };
}
