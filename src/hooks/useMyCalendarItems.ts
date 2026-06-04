import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchMyProjects, MyProjectItem } from '@/services/myProjectsService';
import { useAuth } from '@/contexts/AuthContext';

export type MyCalendarItemKind = 'project' | 'deadline' | 'todo';

export interface MyCalendarItem {
  id: string;
  kind: MyCalendarItemKind;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  subtitle?: string | null;
  status?: string | null;
  overdue?: boolean;
  // Navigation refs
  projectId?: string;
  projectType?: 'standard' | 'large';
  todoId?: string;
  bookingId?: string | null;
  largeProjectId?: string | null;
}

export interface MyCalendarData {
  items: MyCalendarItem[];
  projects: MyProjectItem[];
  todos: Array<{
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string | null;
    end_time: string | null;
    address: string | null;
    booking_id: string | null;
    large_project_id: string | null;
    planning_status: string | null;
  }>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const isOverdueDate = (iso: string) => iso < todayIso();

export const useMyCalendarItems = (staffId: string | null) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<MyCalendarData>({
    queryKey: ['my-calendar-items', staffId, userId],
    enabled: !!staffId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!staffId) return { items: [], projects: [], todos: [] };

      // 1) Mina projekt
      const projects = await fetchMyProjects(staffId);

      // Bygg id-set
      const stdBookingIds = projects
        .filter((p) => p.type === 'standard' && p.bookingNumber)
        .map((p) => p.bookingNumber as string);
      const largeIds = projects
        .filter((p) => p.type === 'large')
        .map((p) => p.id);

      // 2) Mina todos: created_by = userId ELLER tillhör mina projekt
      //    ELLER personliga my_calendar-todos (assigned_staff_id = staffId)
      const orFilters: string[] = [];
      if (userId) orFilters.push(`created_by.eq.${userId}`);
      if (staffId) orFilters.push(`assigned_staff_id.eq.${staffId}`);
      if (stdBookingIds.length > 0) {
        orFilters.push(`booking_id.in.(${stdBookingIds.map((s) => `"${s}"`).join(',')})`);
      }
      if (largeIds.length > 0) {
        orFilters.push(`large_project_id.in.(${largeIds.join(',')})`);
      }

      let todos: MyCalendarData['todos'] = [];
      if (orFilters.length > 0) {
        const q = supabase
          .from('todos')
          .select(
            'id, title, scheduled_date, start_time, end_time, address, booking_id, large_project_id, planning_status',
          )
          .not('scheduled_date', 'is', null)
          .or(orFilters.join(','));
        const { data, error } = await q;
        if (error) {
          // Don't crash — surface empty todos
          console.warn('[useMyCalendarItems] todos fetch error', error);
          todos = [];
        } else {
          todos = (data || []) as any;
        }
      }

      // 3) Bygg calendar items
      const items: MyCalendarItem[] = [];

      for (const p of projects) {
        // Projektdatum
        if (p.eventDate) {
          items.push({
            id: `proj-${p.type}-${p.id}`,
            kind: 'project',
            title: p.name,
            date: p.eventDate.slice(0, 10),
            subtitle: p.clientName || p.address || null,
            status: p.status,
            projectId: p.id,
            projectType: p.type,
            overdue: false,
          });
        }
        // Nästa deadline
        if (p.nextDeadline) {
          const d = p.nextDeadline.slice(0, 10);
          items.push({
            id: `dl-${p.type}-${p.id}`,
            kind: 'deadline',
            title: `Deadline · ${p.name}`,
            date: d,
            subtitle: p.clientName || null,
            status: p.status,
            projectId: p.id,
            projectType: p.type,
            overdue: isOverdueDate(d),
          });
        }
      }

      for (const t of todos) {
        if (!t.scheduled_date) continue;
        const d = t.scheduled_date.slice(0, 10);
        const isDone = t.planning_status === 'done' || t.planning_status === 'completed';
        items.push({
          id: `todo-${t.id}`,
          kind: 'todo',
          title: t.title || 'Todo',
          date: d,
          startTime: t.start_time ? t.start_time.slice(0, 5) : '08:00',
          endTime: t.end_time ? t.end_time.slice(0, 5) : '09:00',
          subtitle: t.address || null,
          status: t.planning_status,
          overdue: !isDone && isOverdueDate(d),
          todoId: t.id,
          bookingId: t.booking_id,
          largeProjectId: t.large_project_id,
        });
      }

      // Sortera
      items.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
      });

      return { items, projects, todos };
    },
  });
};
