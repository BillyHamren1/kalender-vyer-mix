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
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

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

const timeOf = (value: string | null | undefined) => (value ? value.slice(0, 5) : null);
const activityKey = (value: string | null | undefined) => {
  if (value === 'unpacking') return 'return';
  return value || 'other';
};

export function useWarehousePersonnelWeek(rangeStart: Date, rangeEnd: Date) {
  const from = format(rangeStart, 'yyyy-MM-dd');
  const to = format(rangeEnd, 'yyyy-MM-dd');
  const { organizationId, isLoading: organizationLoading } = useCurrentOrg();

  const query = useQuery<{ rows: PersonnelRow[]; unstaffed: PersonnelJob[] }>({
    queryKey: ['warehouse-personnel-week', organizationId, from, to],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: assignments, error: aErr }, { data: events, error: eErr }, { data: staff, error: sErr }] =
        await Promise.all([
          supabase
            .from('warehouse_assignments')
            .select(
              'id, staff_id, assignment_date, assignment_type, status, title, start_time, end_time, warehouse_event_id, packing_id, booking_id, booking_number, customer_name, delivery_address',
            )
            .eq('organization_id', organizationId!)
            .gte('assignment_date', from)
            .lte('assignment_date', to),
          supabase
            .from('warehouse_calendar_events')
            .select('id, title, booking_id, booking_number, event_type, start_time, end_time, delivery_address')
            .eq('organization_id', organizationId!)
            .gte('start_time', `${from}T00:00:00`)
            .lte('start_time', `${to}T23:59:59`),
          supabase
            .from('staff_members')
            .select('id, name, color, tags, is_active')
            .eq('organization_id', organizationId!)
            .eq('is_active', true)
            .order('name', { ascending: true }),
        ]);

      if (aErr) throw aErr;
      if (eErr) throw eErr;
      if (sErr) throw sErr;

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

      const assignedEventIds = new Set<string>();
      const directPackingKeys = new Set<string>();

      for (const assignment of (assignments || []) as Row[]) {
        if (assignment.warehouse_event_id) assignedEventIds.add(String(assignment.warehouse_event_id));
        if (assignment.packing_id && assignment.booking_id) {
          directPackingKeys.add(
            `${assignment.booking_id}|${activityKey(assignment.assignment_type)}|${assignment.assignment_date}`,
          );
        }

        const staffId = String(assignment.staff_id ?? 'unknown');
        const row =
          byStaff.get(staffId) ||
          ({
            staffId: assignment.staff_id ?? null,
            staffName: names.get(staffId) || 'Okänd personal',
            staffColor: colors.get(staffId) || null,
            jobs: [],
          } as PersonnelRow);

        row.jobs.push({
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
          date: assignment.assignment_date || from,
          startTime: timeOf(assignment.start_time),
          endTime: timeOf(assignment.end_time),
        });
        byStaff.set(staffId, row);
      }

      const unstaffed: PersonnelJob[] = ((events || []) as Row[])
        .filter((event) => {
          if (assignedEventIds.has(String(event.id))) return false;
          const date = String(event.start_time).slice(0, 10);
          const fallbackKey = `${event.booking_id}|${activityKey(event.event_type)}|${date}`;
          return !event.booking_id || !directPackingKeys.has(fallbackKey);
        })
        .map((event) => ({
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
          date: String(event.start_time).slice(0, 10),
          startTime: String(event.start_time).slice(11, 16) || null,
          endTime: event.end_time ? String(event.end_time).slice(11, 16) : null,
        }));

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
