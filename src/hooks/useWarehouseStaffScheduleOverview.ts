import { useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { WarehouseStaffMember } from './useWarehouseStaffActivations';

export type WarehouseScheduleView = 'day' | 'week' | 'month';

export interface WarehouseStaffScheduleItem {
  id: string;
  date: string;
  title: string;
  kind: 'warehouse' | 'planning';
  resourceId: string;
  resourceLabel: string;
  eventType?: string;
  startTime: string | null;
  endTime: string | null;
  bookingId?: string | null;
  bookingNumber?: string | null;
  deliveryAddress?: string | null;
}

export interface WarehouseStaffScheduleGroup {
  staff: WarehouseStaffMember;
  items: WarehouseStaffScheduleItem[];
}

const getRange = (date: Date, view: WarehouseScheduleView) => {
  switch (view) {
    case 'day':
      return { start: date, end: date };
    case 'week':
      return {
        start: startOfWeek(date, { weekStartsOn: 1 }),
        end: endOfWeek(date, { weekStartsOn: 1 }),
      };
    case 'month':
    default:
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
};

const teamLabel = (teamId: string) => {
  if (teamId.startsWith('lager-')) return `Lager ${teamId.replace('lager-', '')}`;
  if (teamId.startsWith('team-')) return `Team ${teamId.replace('team-', '')}`;
  return teamId;
};

export function useWarehouseStaffScheduleOverview(
  staffMembers: WarehouseStaffMember[],
  date: Date,
  view: WarehouseScheduleView,
) {
  const { start, end } = getRange(date, view);
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');
  const endExclusiveKey = format(addDays(end, 1), 'yyyy-MM-dd');
  const staffIds = staffMembers.map((staff) => staff.id);

  return useQuery({
    queryKey: ['warehouse-staff-schedule-overview', staffIds.join(','), startKey, endKey],
    enabled: staffIds.length > 0,
    queryFn: async (): Promise<WarehouseStaffScheduleGroup[]> => {
      const result = new Map<string, WarehouseStaffScheduleGroup>();

      staffMembers.forEach((staff) => {
        result.set(staff.id, { staff, items: [] });
      });

      const { data: assignments, error: assignmentError } = await supabase
        .from('staff_assignments')
        .select('id, staff_id, assignment_date, team_id')
        .in('staff_id', staffIds)
        .gte('assignment_date', startKey)
        .lte('assignment_date', endKey);

      if (assignmentError) throw assignmentError;

      const lagerTeamIds = Array.from(
        new Set(
          (assignments || [])
            .map((assignment) => assignment.team_id)
            .filter((teamId) => typeof teamId === 'string' && teamId.startsWith('lager-')),
        ),
      );

      const fieldTeamIds = Array.from(
        new Set(
          (assignments || [])
            .map((assignment) => assignment.team_id)
            .filter((teamId) => typeof teamId === 'string' && teamId.startsWith('team-')),
        ),
      );

      const warehouseEvents = lagerTeamIds.length
        ? await supabase
            .from('warehouse_calendar_events')
            .select('id, title, start_time, end_time, event_type, resource_id, booking_id, booking_number, delivery_address')
            .in('resource_id', lagerTeamIds)
            .gte('start_time', `${startKey}T00:00:00`)
            .lt('start_time', `${endExclusiveKey}T00:00:00`)
        : { data: [], error: null };

      if (warehouseEvents.error) throw warehouseEvents.error;

      const fieldEvents = fieldTeamIds.length
        ? await supabase
            .from('calendar_events')
            .select('id, title, start_time, end_time, event_type, resource_id, booking_id, booking_number, delivery_address')
            .in('resource_id', fieldTeamIds)
            .gte('start_time', `${startKey}T00:00:00`)
            .lt('start_time', `${endExclusiveKey}T00:00:00`)
        : { data: [], error: null };

      if (fieldEvents.error) throw fieldEvents.error;

      const eventsByDateAndResource = new Map<string, Array<any>>();

      [...(warehouseEvents.data || []), ...(fieldEvents.data || [])].forEach((event) => {
        const dateKey = event.start_time.slice(0, 10);
        const mapKey = `${dateKey}__${event.resource_id}`;
        const current = eventsByDateAndResource.get(mapKey) || [];
        current.push(event);
        eventsByDateAndResource.set(mapKey, current);
      });

      (assignments || []).forEach((assignment) => {
        const group = result.get(assignment.staff_id);
        if (!group) return;

        if (assignment.team_id.startsWith('team-')) {
          const mapKey = `${assignment.assignment_date}__${assignment.team_id}`;
          const matchingEvents = eventsByDateAndResource.get(mapKey) || [];

          if (matchingEvents.length === 0) {
            group.items.push({
              id: `plan-${assignment.id}`,
              date: assignment.assignment_date,
              title: `Ute i fält – ${teamLabel(assignment.team_id)}`,
              kind: 'planning',
              resourceId: assignment.team_id,
              resourceLabel: teamLabel(assignment.team_id),
              eventType: 'field',
              startTime: null,
              endTime: null,
            });
            return;
          }

          matchingEvents.forEach((event) => {
            group.items.push({
              id: `field-${assignment.id}-${event.id}`,
              date: assignment.assignment_date,
              title: `Ute i fält – ${event.title}`,
              kind: 'planning',
              resourceId: event.resource_id,
              resourceLabel: teamLabel(event.resource_id),
              eventType: event.event_type || 'field',
              startTime: event.start_time,
              endTime: event.end_time,
              bookingId: event.booking_id,
              bookingNumber: event.booking_number,
              deliveryAddress: event.delivery_address,
            });
          });
          return;
        }

        if (assignment.team_id.startsWith('lager-')) {
          const mapKey = `${assignment.assignment_date}__${assignment.team_id}`;
          const matchingEvents = eventsByDateAndResource.get(mapKey) || [];

          if (matchingEvents.length === 0) {
            group.items.push({
              id: `lager-${assignment.id}`,
              date: assignment.assignment_date,
              title: `${teamLabel(assignment.team_id)} – Lagerpass`,
              kind: 'warehouse',
              resourceId: assignment.team_id,
              resourceLabel: teamLabel(assignment.team_id),
              eventType: 'warehouse_shift',
              startTime: null,
              endTime: null,
            });
            return;
          }

          matchingEvents.forEach((event) => {
            group.items.push({
              id: `warehouse-${assignment.id}-${event.id}`,
              date: assignment.assignment_date,
              title: event.title,
              kind: 'warehouse',
              resourceId: event.resource_id,
              resourceLabel: teamLabel(event.resource_id),
              eventType: event.event_type,
              startTime: event.start_time,
              endTime: event.end_time,
              bookingId: event.booking_id,
              bookingNumber: event.booking_number,
              deliveryAddress: event.delivery_address,
            });
          });
        }
      });

      return staffMembers
        .map((staff) => {
          const group = result.get(staff.id)!;
          const deduped = Array.from(new Map(group.items.map((item) => [item.id, item])).values()).sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
            return aTime - bTime;
          });
          return { staff, items: deduped };
        })
        .sort((a, b) => {
          // Tillgängliga (utan poster) först, bokade under
          const aAvailable = a.items.length === 0;
          const bAvailable = b.items.length === 0;
          if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
          return a.staff.name.localeCompare(b.staff.name, 'sv');
        });
    },
  });
}
