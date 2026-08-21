import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WarehousePersonnelAssignment {
  id: string;
  staffId: string;
  staffName: string;
  assignmentDate: string;
  assignmentType: string;
  title: string;
  description: string | null;
  status: string | null;
  startTime: string | null;
  endTime: string | null;
  warehouseEventId: string | null;
  packingId: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  deliveryAddress: string | null;
  customerName: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WarehouseStaffProductivitySignal {
  staffId: string;
  staffName: string;
  sampleCount: number;
  actualSampleCount: number;
  medianMinutes: number | null;
  typeMedians: Record<string, number>;
  relativeToTypeMedianPct: number | null;
  confidence: 'none' | 'low' | 'medium' | 'high';
}

interface Options {
  from: string;
  to: string;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
};

const durationMinutes = (row: WarehousePersonnelAssignment): { minutes: number; actual: boolean } | null => {
  const metadata = row.metadata || {};
  const actualStart =
    (metadata.actual_started_at as string | undefined) ||
    (metadata.started_at as string | undefined) ||
    null;
  const actualEnd =
    (metadata.actual_completed_at as string | undefined) ||
    (metadata.completed_at as string | undefined) ||
    null;

  const startRaw = actualStart || row.startTime;
  const endRaw = actualEnd || row.endTime;
  if (!startRaw || !endRaw) return null;

  const start = new Date(startRaw).getTime();
  const end = new Date(endRaw).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const minutes = Math.round((end - start) / 60_000);
  if (minutes <= 0 || minutes > 24 * 60) return null;
  return { minutes, actual: !!actualStart && !!actualEnd };
};

async function fetchPersonnelAssignments(from: string, to: string): Promise<WarehousePersonnelAssignment[]> {
  const { data, error } = await supabase
    .from('warehouse_assignments')
    .select(
      'id, staff_id, assignment_date, assignment_type, title, description, status, start_time, end_time, warehouse_event_id, packing_id, booking_id, booking_number, delivery_address, customer_name, source, metadata',
    )
    .gte('assignment_date', from)
    .lte('assignment_date', to)
    .order('assignment_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });

  if (error) throw error;

  const rows = data || [];
  const staffIds = Array.from(new Set(rows.map((r: any) => r.staff_id).filter(Boolean)));
  let names = new Map<string, string>();

  if (staffIds.length > 0) {
    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('id, name')
      .in('id', staffIds);
    if (staffError) throw staffError;
    names = new Map((staff || []).map((s: any) => [s.id as string, s.name as string]));
  }

  return rows.map((row: any) => ({
    id: row.id,
    staffId: row.staff_id,
    staffName: names.get(row.staff_id) || 'Personal',
    assignmentDate: row.assignment_date,
    assignmentType: row.assignment_type || 'other',
    title: row.title || 'Lageruppgift',
    description: row.description ?? null,
    status: row.status ?? null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    warehouseEventId: row.warehouse_event_id ?? null,
    packingId: row.packing_id ?? null,
    bookingId: row.booking_id ?? null,
    bookingNumber: row.booking_number ?? null,
    deliveryAddress: row.delivery_address ?? null,
    customerName: row.customer_name ?? null,
    source: row.source ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  }));
}

export function useWarehousePersonnelCalendar({ from, to }: Options) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['warehouse-personnel-calendar', from, to],
    queryFn: () => fetchPersonnelAssignments(from, to),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`warehouse-personnel-calendar-${from}-${to}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_assignments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['warehouse-personnel-calendar'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [from, to, queryClient]);

  const assignments = query.data || [];

  const byStaff = useMemo(() => {
    const map = new Map<string, WarehousePersonnelAssignment[]>();
    assignments.forEach((assignment) => {
      const current = map.get(assignment.staffId) || [];
      current.push(assignment);
      map.set(assignment.staffId, current);
    });
    return map;
  }, [assignments]);

  const productivity = useMemo<WarehouseStaffProductivitySignal[]>(() => {
    const completed = assignments.filter((a) => (a.status || '').toLowerCase() === 'completed');
    const typeDurations = new Map<string, number[]>();

    completed.forEach((assignment) => {
      const duration = durationMinutes(assignment);
      if (!duration) return;
      const list = typeDurations.get(assignment.assignmentType) || [];
      list.push(duration.minutes);
      typeDurations.set(assignment.assignmentType, list);
    });

    const typeMedians = new Map<string, number>();
    typeDurations.forEach((values, type) => {
      const value = median(values);
      if (value != null) typeMedians.set(type, value);
    });

    const staffGroups = new Map<string, WarehousePersonnelAssignment[]>();
    completed.forEach((assignment) => {
      const list = staffGroups.get(assignment.staffId) || [];
      list.push(assignment);
      staffGroups.set(assignment.staffId, list);
    });

    return Array.from(staffGroups.entries())
      .map(([staffId, rows]) => {
        const measured = rows
          .map((row) => ({ row, duration: durationMinutes(row) }))
          .filter((x): x is { row: WarehousePersonnelAssignment; duration: { minutes: number; actual: boolean } } => !!x.duration);

        const ratios = measured
          .map(({ row, duration }) => {
            const baseline = typeMedians.get(row.assignmentType);
            if (!baseline || baseline <= 0) return null;
            return duration.minutes / baseline;
          })
          .filter((x): x is number => x != null && Number.isFinite(x));

        const actualSampleCount = measured.filter((x) => x.duration.actual).length;
        const sampleCount = measured.length;
        const ratioMedian = median(ratios.map((r) => r * 100));
        const confidence: WarehouseStaffProductivitySignal['confidence'] =
          actualSampleCount >= 15 ? 'high'
            : actualSampleCount >= 6 ? 'medium'
              : sampleCount >= 5 ? 'low'
                : 'none';

        const staffTypeMedians: Record<string, number> = {};
        const staffTypeGroups = new Map<string, number[]>();
        measured.forEach(({ row, duration }) => {
          const list = staffTypeGroups.get(row.assignmentType) || [];
          list.push(duration.minutes);
          staffTypeGroups.set(row.assignmentType, list);
        });
        staffTypeGroups.forEach((values, type) => {
          const value = median(values);
          if (value != null) staffTypeMedians[type] = value;
        });

        return {
          staffId,
          staffName: rows[0]?.staffName || 'Personal',
          sampleCount,
          actualSampleCount,
          medianMinutes: median(measured.map((x) => x.duration.minutes)),
          typeMedians: staffTypeMedians,
          relativeToTypeMedianPct: ratioMedian == null ? null : Math.round(ratioMedian - 100),
          confidence,
        };
      })
      .sort((a, b) => a.staffName.localeCompare(b.staffName, 'sv'));
  }, [assignments]);

  return {
    assignments,
    byStaff,
    productivity,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
