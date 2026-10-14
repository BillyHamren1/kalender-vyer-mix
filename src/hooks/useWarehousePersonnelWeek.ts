/**
 * Canonical warehouse personnel read model.
 *
 * - warehouse_assignments is the only source for who owns a concrete job.
 * - every active staff member tagged "Lager" is returned, including people
 *   with zero jobs in the selected week.
 * - every query is explicitly scoped to the signed-in organization in
 *   addition to the database RLS policy.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { personnelIntervals, unstaffedWarehouseEvents } from '@/lib/warehouse/personnelIntervals';
import { isWarehouseWorkEvent } from '@/lib/warehouse/warehouseWorkEvents';
import { warehouseDateOf, warehouseDayBounds } from '@/lib/warehouse/warehouseTime';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

export interface PersonnelJob {
  assignmentId: string | null;
  warehouseEventId: string | null;
  packingId: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  title: string;
  customerName: string | null;
  deliveryAddress: string | null;
  activityType: string;
  status: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  plannedDurationMinutes?: number | null;
}

export interface PersonnelRow {
  staffId: string | null;
  staffName: string;
  staffColor: string | null;
  jobs: PersonnelJob[];
}

interface Row {
  id?: string | null;
  staff_id?: string | null;
  assignment_date?: string | null;
  assignment_type?: string | null;
  status?: string | null;
  title?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  warehouse_event_id?: string | null;
  packing_id?: string | null;
  booking_id?: string | null;
  booking_number?: string | null;
  customer_name?: string | null;
  delivery_address?: string | null;
  event_type?: string | null;
  name?: string | null;
  color?: string | null;
  tags?: string[] | null;
}

export function useWarehousePersonnelWeek(rangeStart: Date, rangeEnd: Date) {
  const from = format(rangeStart, 'yyyy-MM-dd');
  const to = format(rangeEnd, 'yyyy-MM-dd');
  const { organizationId, isLoading: organizationLoading } = useCurrentOrg();
  const queryKey = ['warehouse-personnel-week', organizationId, from, to] as const;

  useRealtimeInvalidation({
    channelName: `warehouse-personnel-${organizationId || 'signed-out'}`,
    tables: [
      { table: 'warehouse_assignments', events: ['*'] },
      { table: 'warehouse_calendar_events', events: ['*'] },
    ],
    queryKeys: [['warehouse-personnel-week']],
  });

  const query = useQuery<{ rows: PersonnelRow[]; unstaffed: PersonnelJob[] }>({
    queryKey,
    enabled: !!organizationId,
    staleTime: 30_000,
    // Realtime is primary. Polling stays as a fallback for interrupted
    // subscriptions so a manager's side-by-side view self-heals.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // Fetch overlapping source events first: assignments may only store clock times,
      // so their assignment_date alone cannot discover a job continuing into this range.
      const { data: events, error: eErr } = await supabase
        .from('warehouse_calendar_events')
        .select('id, title, booking_id, booking_number, event_type, start_time, end_time, delivery_address')
        .eq('organization_id', organizationId!)
        .lt('start_time', warehouseDayBounds(to).end)
        .gt('end_time', warehouseDayBounds(from).start);
      if (eErr) throw eErr;
      const sourceEvents = (events || []) as Row[];
      const byEventId = new Map(sourceEvents.map(event => [event.id, event]));
      const eventIds = sourceEvents.map(event => event.id).filter(Boolean);
      const assignmentQuery = () => supabase.from('warehouse_assignments')
        .select('id, staff_id, assignment_date, assignment_type, status, title, start_time, end_time, warehouse_event_id, packing_id, booking_id, booking_number, customer_name, delivery_address')
        .eq('organization_id', organizationId!);
      // Keep query URLs bounded for busy weeks. Exact linked-event queries also
      // include assignments whose original assignment_date precedes this range.
      const linkedQueries = [];
      for (let offset = 0; offset < eventIds.length; offset += 80) {
        linkedQueries.push(assignmentQuery().in('warehouse_event_id', eventIds.slice(offset, offset + 80)));
      }
      const [assignmentResults, { data: staff, error: sErr }] = await Promise.all([
        Promise.all([assignmentQuery().gte('assignment_date', from).lte('assignment_date', to), ...linkedQueries]),
        supabase.from('staff_members')
          .select('id, name, color, tags, is_active')
          .eq('organization_id', organizationId!)
          .eq('is_active', true)
          .order('name', { ascending: true }),
      ]);
      const aErr = assignmentResults.find(result => result.error)?.error;
      if (aErr) throw aErr;
      if (sErr) throw sErr;
      const assignments = [...new Map(assignmentResults.flatMap(result => result.data || []).map(row => [row.id, row])).values()];

      const allStaff = (staff || []) as Row[];
      const names = new Map(allStaff.map((member) => [String(member.id), String(member.name)]));
      const colors = new Map(
        allStaff.map((member) => [String(member.id), member.color ? String(member.color) : null]),
      );
      const assignedStaffIds = new Set(
        ((assignments || []) as Row[])
          .map((assignment) => assignment.staff_id)
          .filter((staffId): staffId is string => !!staffId),
      );

      const warehouseStaff = allStaff.filter(
        (member) =>
          (Array.isArray(member.tags) && member.tags.includes('Lager')) || assignedStaffIds.has(String(member.id)),
      );
      const byStaff = new Map<string, PersonnelRow>();
      for (const member of warehouseStaff) {
        byStaff.set(String(member.id), {
          staffId: String(member.id),
          staffName: String(member.name),
          staffColor: member.color ? String(member.color) : null,
          jobs: [],
        });
      }

      for (const assignment of (assignments || []) as Row[]) {
        const sourceEvent = assignment.warehouse_event_id ? byEventId.get(assignment.warehouse_event_id) : undefined;
        const intervals = personnelIntervals(sourceEvent?.start_time ?? assignment.start_time, sourceEvent?.end_time ?? assignment.end_time, assignment.assignment_date || from, from, to);
        const staffId = String(assignment.staff_id ?? 'unknown');
        const row =
          byStaff.get(staffId) ||
          ({
            staffId: assignment.staff_id ?? null,
            staffName: names.get(staffId) || 'Okänd personal',
            staffColor: colors.get(staffId) || null,
            jobs: [],
          } as PersonnelRow);

        row.jobs.push(...intervals.map(interval => ({
          assignmentId: assignment.id ?? null,
          warehouseEventId: assignment.warehouse_event_id ?? null,
          packingId: assignment.packing_id ?? null,
          bookingId: assignment.booking_id ?? null,
          bookingNumber: assignment.booking_number ?? null,
          title: assignment.title || 'Lageruppgift',
          customerName: assignment.customer_name ?? null,
          deliveryAddress: assignment.delivery_address ?? null,
          activityType: assignment.assignment_type || 'other',
          status: assignment.status || 'planned',
          ...interval,
        })));
        byStaff.set(staffId, row);
      }

      // Only actual warehouse activities can become open jobs. Keep raw events
      // above for linked assignments so legacy staffed work is never hidden.
      const unstaffed: PersonnelJob[] = unstaffedWarehouseEvents(sourceEvents.filter(isWarehouseWorkEvent), (assignments || []) as Row[])
        .flatMap(event => personnelIntervals(event.start_time, event.end_time, warehouseDateOf(event.start_time) || from, from, to).map(interval => ({
          assignmentId: null,
          warehouseEventId: event.id ?? null,
          packingId: null,
          bookingId: event.booking_id ?? null,
          bookingNumber: event.booking_number ?? null,
          title: event.title || 'Lagerjobb',
          customerName: null,
          deliveryAddress: event.delivery_address ?? null,
          activityType: event.event_type || 'other',
          status: 'planned',
          ...interval,
        })));

      const rows = Array.from(byStaff.values()).map((row) => ({
        ...row,
        jobs: row.jobs.sort((a, b) =>
          `${a.date}${a.startTime ?? ''}`.localeCompare(`${b.date}${b.startTime ?? ''}`),
        ),
      }));
      rows.sort((a, b) => a.staffName.localeCompare(b.staffName, 'sv'));

      return {
        rows,
        unstaffed: unstaffed.sort((a, b) =>
          `${a.date}${a.startTime ?? ''}`.localeCompare(`${b.date}${b.startTime ?? ''}`),
        ),
      };
    },
  });

  return { ...query, isLoading: organizationLoading || query.isLoading };
}
