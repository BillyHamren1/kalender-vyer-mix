/**
 * useWarehousePersonnelWeek — canonical personnel view for the warehouse.
 *
 * The ONLY source of "who works with what" is the concrete
 * `warehouse_assignments` row (staff_id ↔ warehouse_event_id / packing_id).
 * We never infer that a person works on every job on a legacy `lager-N`
 * column just because they are on that team for the day.
 *
 * Unstaffed jobs are derived by subtracting assigned event ids from the
 * warehouse calendar events in the same range.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

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
  jobs: PersonnelJob[];
}

type Row = Record<string, string | null | undefined>;

const timeOf = (value: string | null | undefined) => (value ? value.slice(0, 5) : null);

export function useWarehousePersonnelWeek(rangeStart: Date, rangeEnd: Date) {
  const from = format(rangeStart, 'yyyy-MM-dd');
  const to = format(rangeEnd, 'yyyy-MM-dd');

  return useQuery<{ rows: PersonnelRow[]; unstaffed: PersonnelJob[] }>({
    queryKey: ['warehouse-personnel-week', from, to],
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: assignments, error: aErr }, { data: events, error: eErr }] = await Promise.all([
        supabase
          .from('warehouse_assignments')
          .select(
            'id, staff_id, assignment_date, assignment_type, status, title, start_time, end_time, warehouse_event_id, packing_id, booking_id, booking_number, customer_name, delivery_address',
          )
          .gte('assignment_date', from)
          .lte('assignment_date', to),
        supabase
          .from('warehouse_calendar_events')
          .select('id, title, booking_id, booking_number, event_type, start_time, end_time, delivery_address')
          .gte('start_time', `${from}T00:00:00`)
          .lte('start_time', `${to}T23:59:59`),
      ]);

      if (aErr) throw aErr;
      if (eErr) throw eErr;

      const staffIds = Array.from(
        new Set((assignments || []).map((a: Row) => a.staff_id).filter(Boolean)),
      );
      let names = new Map<string, string>();
      if (staffIds.length > 0) {
        const { data: staff } = await supabase
          .from('staff_members')
          .select('id, name')
          .in('id', staffIds as string[]);
        names = new Map((staff || []).map((s: Row) => [String(s.id), String(s.name)]));
      }

      const byStaff = new Map<string, PersonnelRow>();
      const assignedEventIds = new Set<string>();

      for (const a of (assignments || []) as Row[]) {
        if (a.warehouse_event_id) assignedEventIds.add(a.warehouse_event_id);
        const key = String(a.staff_id ?? 'unknown');
        const row =
          byStaff.get(key) ||
          ({ staffId: a.staff_id ?? null, staffName: names.get(key) || 'Okänd personal', jobs: [] } as PersonnelRow);
        row.jobs.push({
          assignmentId: a.id,
          warehouseEventId: a.warehouse_event_id ?? null,
          packingId: a.packing_id ?? null,
          bookingId: a.booking_id ?? null,
          bookingNumber: a.booking_number ?? null,
          title: a.title || 'Lageruppgift',
          customerName: a.customer_name ?? null,
          deliveryAddress: a.delivery_address ?? null,
          activityType: a.assignment_type || 'other',
          status: a.status || 'planned',
          date: a.assignment_date,
          startTime: timeOf(a.start_time),
          endTime: timeOf(a.end_time),
        });
        byStaff.set(key, row);
      }

      const unstaffed: PersonnelJob[] = ((events || []) as Row[])
        .filter((e) => !assignedEventIds.has(e.id))
        .map((e) => ({
          assignmentId: null,
          warehouseEventId: e.id,
          packingId: null,
          bookingId: e.booking_id ?? null,
          bookingNumber: e.booking_number ?? null,
          title: e.title || 'Lagerjobb',
          customerName: null,
          deliveryAddress: e.delivery_address ?? null,
          activityType: e.event_type || 'other',
          status: 'planned',
          date: String(e.start_time).slice(0, 10),
          startTime: String(e.start_time).slice(11, 16) || null,
          endTime: e.end_time ? String(e.end_time).slice(11, 16) : null,
        }));

      const rows = Array.from(byStaff.values()).map((row) => ({
        ...row,
        jobs: row.jobs.sort((a, b) => `${a.date}${a.startTime ?? ''}`.localeCompare(`${b.date}${b.startTime ?? ''}`)),
      }));
      rows.sort((a, b) => a.staffName.localeCompare(b.staffName, 'sv'));

      return { rows, unstaffed: unstaffed.sort((a, b) => `${a.date}${a.startTime ?? ''}`.localeCompare(`${b.date}${b.startTime ?? ''}`)) };
    },
  });
}
