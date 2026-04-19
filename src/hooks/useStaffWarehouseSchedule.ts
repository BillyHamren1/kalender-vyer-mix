import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';

export type ScheduleViewMode = 'day' | 'week' | 'month';

export interface StaffScheduleItem {
  id: string;
  date: string; // yyyy-MM-dd
  startTime: string | null; // ISO
  endTime: string | null; // ISO
  title: string;
  kind: 'warehouse' | 'planning';
  eventType?: string; // packing, delivery, return, inventory, unpacking, internal_task, transport
  resourceId: string; // lager-N or team-N
  resourceLabel: string;
  bookingId?: string | null;
  bookingNumber?: string | null;
  deliveryAddress?: string | null;
}

const teamLabel = (teamId: string): string => {
  if (teamId.startsWith('lager-')) {
    const n = teamId.replace('lager-', '');
    return `Lager ${n}`;
  }
  if (teamId.startsWith('team-')) {
    const n = teamId.replace('team-', '');
    return `Team ${n}`;
  }
  return teamId;
};

export const eventTypeLabel = (type?: string): string => {
  switch (type) {
    case 'packing': return 'Packning';
    case 'delivery': return 'Utleverans';
    case 'return': return 'Retur';
    case 'inventory': return 'Inventering';
    case 'unpacking': return 'Uppackning';
    case 'internal_task': return 'Lageruppgift';
    case 'transport': return 'Transport';
    default: return type || 'Händelse';
  }
};

export const eventTypeColor = (type?: string): string => {
  // Returns tailwind classes for a colored dot
  switch (type) {
    case 'packing': return 'bg-blue-500';
    case 'delivery': return 'bg-emerald-500';
    case 'return': return 'bg-amber-500';
    case 'inventory': return 'bg-purple-500';
    case 'unpacking': return 'bg-cyan-500';
    case 'internal_task': return 'bg-warehouse';
    case 'transport': return 'bg-orange-500';
    default: return 'bg-muted-foreground';
  }
};

const getRange = (date: Date, view: ScheduleViewMode): { start: Date; end: Date } => {
  switch (view) {
    case 'day':
      return { start: date, end: date };
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
};

export function useStaffWarehouseSchedule(staffId: string | null, date: Date, view: ScheduleViewMode) {
  const { start, end } = getRange(date, view);
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');

  return useQuery({
    enabled: !!staffId,
    queryKey: ['staff-warehouse-schedule', staffId, startKey, endKey],
    queryFn: async (): Promise<StaffScheduleItem[]> => {
      if (!staffId) return [];

      // 1. Fetch staff_assignments in the period
      const { data: assignments, error: aErr } = await supabase
        .from('staff_assignments')
        .select('id, assignment_date, team_id')
        .eq('staff_id', staffId)
        .gte('assignment_date', startKey)
        .lte('assignment_date', endKey);

      if (aErr) throw aErr;

      const items: StaffScheduleItem[] = [];

      // Build (date -> lager team_ids[]) and planning entries directly
      const lagerByDate = new Map<string, Set<string>>();

      (assignments || []).forEach(a => {
        const dateStr = a.assignment_date;
        if (typeof a.team_id !== 'string') return;
        if (a.team_id.startsWith('lager-')) {
          if (!lagerByDate.has(dateStr)) lagerByDate.set(dateStr, new Set());
          lagerByDate.get(dateStr)!.add(a.team_id);
        } else if (a.team_id.startsWith('team-')) {
          // planning team assignment — schedule entry as a "context" item
          items.push({
            id: `plan-${a.id}`,
            date: dateStr,
            startTime: null,
            endTime: null,
            title: `${teamLabel(a.team_id)} – Planeringspass`,
            kind: 'planning',
            resourceId: a.team_id,
            resourceLabel: teamLabel(a.team_id),
          });
        }
      });

      // 2. For each (date, lager-N) fetch warehouse_calendar_events for that day & resource
      const lagerFetches: Promise<void>[] = [];
      lagerByDate.forEach((resources, dateStr) => {
        const startISO = `${dateStr}T00:00:00`;
        const endISO = `${dateStr}T23:59:59`;
        resources.forEach(resourceId => {
          lagerFetches.push((async () => {
            const { data, error } = await supabase
              .from('warehouse_calendar_events')
              .select('id, title, start_time, end_time, event_type, resource_id, booking_id, booking_number, delivery_address')
              .eq('resource_id', resourceId)
              .gte('start_time', startISO)
              .lte('start_time', endISO);
            if (error) throw error;
            (data || []).forEach((e: any) => {
              items.push({
                id: `wh-${e.id}`,
                date: dateStr,
                startTime: e.start_time,
                endTime: e.end_time,
                title: e.title,
                kind: 'warehouse',
                eventType: e.event_type,
                resourceId: e.resource_id,
                resourceLabel: teamLabel(e.resource_id),
                bookingId: e.booking_id,
                bookingNumber: e.booking_number,
                deliveryAddress: e.delivery_address,
              });
            });
          })());
        });
      });

      await Promise.all(lagerFetches);

      // Sort by date then by start time (no time → end of day)
      items.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const at = a.startTime ? new Date(a.startTime).getTime() : Infinity;
        const bt = b.startTime ? new Date(b.startTime).getTime() : Infinity;
        return at - bt;
      });

      return items;
    },
  });
}
