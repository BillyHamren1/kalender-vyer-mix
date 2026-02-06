import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export type EventCategory = 'planning' | 'warehouse' | 'logistics';
export type DashboardViewMode = 'day' | 'week' | 'month';

export interface DashboardEvent {
  id: string;
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  date: Date;
  eventType: string;
  category: EventCategory;
  assignedStaff: Array<{ id: string; name: string; color: string | null; teamId?: string }>;
  status?: string;
  deliveryAddress?: string | null;
}

export interface DashboardStats {
  unopenedBookings: number;
  ongoingProjects: number;
  activePackings: number;
  transportToday: number;
  availableStaff: number;
  upcomingRigs: number;
}

function getDateRange(viewMode: DashboardViewMode, currentDate: Date) {
  switch (viewMode) {
    case 'day':
      return {
        start: currentDate,
        end: currentDate,
      };
    case 'week':
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    case 'month':
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      };
  }
}

export function useDashboardEvents(
  viewMode: DashboardViewMode,
  currentDate: Date,
  activeCategories: EventCategory[]
) {
  const { start, end } = getDateRange(viewMode, currentDate);
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  // Fetch planning events (calendar_events + bookings + staff)
  const planningQuery = useQuery({
    queryKey: ['dashboard-planning', startStr, endStr],
    queryFn: async (): Promise<DashboardEvent[]> => {
      const { data: events, error } = await supabase
        .from('calendar_events')
        .select('id, booking_id, event_type, start_time, resource_id')
        .gte('start_time', `${startStr}T00:00:00`)
        .lte('start_time', `${endStr}T23:59:59`)
        .neq('resource_id', 'warehouse');

      if (error) { console.error('Planning events error:', error); return []; }
      if (!events?.length) return [];

      // Batch fetch bookings
      const bookingIds = [...new Set(events.map(e => e.booking_id).filter(Boolean))];
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_number, client, deliveryaddress')
        .in('id', bookingIds.length > 0 ? bookingIds : ['none']);

      const bookingMap = new Map((bookings || []).map(b => [b.id, b]));

      // Batch fetch staff assignments
      const { data: assignments } = await supabase
        .from('staff_assignments')
        .select('staff_id, team_id, assignment_date, staff_members(id, name, color)')
        .gte('assignment_date', startStr)
        .lte('assignment_date', endStr);

      // Group staff by date+team
      const staffByDateTeam = new Map<string, Array<{ id: string; name: string; color: string | null; teamId: string }>>();
      (assignments || []).forEach(a => {
        const key = `${a.assignment_date}-${a.team_id}`;
        const staff = a.staff_members as any;
        if (!staffByDateTeam.has(key)) staffByDateTeam.set(key, []);
        staffByDateTeam.get(key)!.push({ id: staff.id, name: staff.name, color: staff.color, teamId: a.team_id });
      });

      return events.map(e => {
        const booking = e.booking_id ? bookingMap.get(e.booking_id) : null;
        const dateStr = format(new Date(e.start_time), 'yyyy-MM-dd');
        const staffKey = `${dateStr}-${e.resource_id}`;

        return {
          id: e.id,
          bookingId: e.booking_id || '',
          bookingNumber: booking?.booking_number || null,
          client: booking?.client || 'Okänd',
          date: new Date(e.start_time),
          eventType: e.event_type || 'Event',
          category: 'planning' as EventCategory,
          assignedStaff: staffByDateTeam.get(staffKey) || [],
          deliveryAddress: booking?.deliveryaddress || null,
        };
      });
    },
    enabled: activeCategories.includes('planning'),
  });

  // Fetch warehouse events
  const warehouseQuery = useQuery({
    queryKey: ['dashboard-warehouse', startStr, endStr],
    queryFn: async (): Promise<DashboardEvent[]> => {
      const { data, error } = await supabase
        .from('warehouse_calendar_events')
        .select('id, booking_id, booking_number, title, event_type, start_time')
        .gte('start_time', startStr)
        .lte('start_time', `${endStr}T23:59:59`)
        .order('start_time', { ascending: true });

      if (error) { console.error('Warehouse events error:', error); return []; }

      return (data || []).map(e => ({
        id: e.id,
        bookingId: e.booking_id || '',
        bookingNumber: e.booking_number,
        client: e.title,
        date: new Date(e.start_time),
        eventType: e.event_type || 'packing',
        category: 'warehouse' as EventCategory,
        assignedStaff: [],
        status: 'active',
      }));
    },
    enabled: activeCategories.includes('warehouse'),
  });

  // Fetch logistics events
  const logisticsQuery = useQuery({
    queryKey: ['dashboard-logistics', startStr, endStr],
    queryFn: async (): Promise<DashboardEvent[]> => {
      const { data, error } = await supabase
        .from('transport_assignments')
        .select(`
          id, vehicle_id, transport_date, status,
          booking:bookings!booking_id(id, client, booking_number, deliveryaddress)
        `)
        .gte('transport_date', startStr)
        .lte('transport_date', endStr)
        .order('transport_date', { ascending: true });

      if (error) { console.error('Logistics events error:', error); return []; }

      return (data || []).map(a => {
        const booking = a.booking as any;
        return {
          id: a.id,
          bookingId: booking?.id || '',
          bookingNumber: booking?.booking_number || null,
          client: booking?.client || 'Transport',
          date: new Date(a.transport_date),
          eventType: 'transport',
          category: 'logistics' as EventCategory,
          assignedStaff: [],
          status: a.status,
          deliveryAddress: booking?.deliveryaddress || null,
        };
      });
    },
    enabled: activeCategories.includes('logistics'),
  });

  // Merge all events
  const allEvents: DashboardEvent[] = [
    ...(activeCategories.includes('planning') ? (planningQuery.data || []) : []),
    ...(activeCategories.includes('warehouse') ? (warehouseQuery.data || []) : []),
    ...(activeCategories.includes('logistics') ? (logisticsQuery.data || []) : []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const isLoading = planningQuery.isLoading || warehouseQuery.isLoading || logisticsQuery.isLoading;

  const refetchAll = () => {
    planningQuery.refetch();
    warehouseQuery.refetch();
    logisticsQuery.refetch();
  };

  return { events: allEvents, isLoading, refetchAll };
}

// Stats hook - always fetches regardless of category filter
export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd');

      const [
        unopenedRes,
        projectsRes,
        packingsRes,
        transportRes,
        staffRes,
        rigsRes,
      ] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('viewed', false).eq('status', 'CONFIRMED'),
        supabase.from('projects').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
        supabase.from('packing_projects').select('id', { count: 'exact', head: true }).in('status', ['planning', 'in_progress']),
        supabase.from('transport_assignments').select('id', { count: 'exact', head: true }).eq('transport_date', today),
        supabase.from('staff_members').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('event_type', 'Rigg')
          .gte('start_time', `${today}T00:00:00`)
          .lte('start_time', `${weekEnd}T23:59:59`),
      ]);

      return {
        unopenedBookings: unopenedRes.count || 0,
        ongoingProjects: projectsRes.count || 0,
        activePackings: packingsRes.count || 0,
        transportToday: transportRes.count || 0,
        availableStaff: staffRes.count || 0,
        upcomingRigs: rigsRes.count || 0,
      };
    },
    refetchInterval: 30000,
  });
}
