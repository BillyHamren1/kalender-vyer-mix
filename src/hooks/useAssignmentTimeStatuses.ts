/**
 * useAssignmentTimeStatuses
 * --------------------------------------------------------------------------
 * Hämtar tidsstatus för en lista assignments (staff × date × target) och
 * returnerar en Map keyed på `${staffId}|${date}|${targetKey}`.
 *
 * Konsumeras av:
 *   - personalkalendern (badge på event-rader)
 *   - projektvyn (badge på pass)
 *   - tidrapportvyn (status-pill)
 *
 * Bygger ovanpå den rena helpern `computeAssignmentTimeStatus` så att alla
 * tre vyer alltid räknar samma sak.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  computeAssignmentTimeStatus,
  AtsResult,
  AtsLte,
  AtsTimeReport,
  AtsWorkday,
  AtsWorkdayFlag,
} from '@/lib/staff/assignmentTimeStatus';

export interface AssignmentKey {
  staffId: string;
  date: string; // yyyy-MM-dd
  bookingId?: string | null;
  largeProjectId?: string | null;
}

export const targetKey = (a: { bookingId?: string | null; largeProjectId?: string | null }) =>
  a.largeProjectId ? `lp:${a.largeProjectId}` : a.bookingId ? `b:${a.bookingId}` : 'none';

export const assignmentStatusKey = (a: AssignmentKey) =>
  `${a.staffId}|${a.date}|${targetKey(a)}`;

const dayBounds = (date: string) => {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

export function useAssignmentTimeStatuses(assignments: AssignmentKey[]) {
  const queryClient = useQueryClient();

  // Sammanställ unika (staffId, date) som vi behöver hämta data för
  const staffDays = useMemo(() => {
    const set = new Map<string, { staffId: string; date: string }>();
    for (const a of assignments) {
      const k = `${a.staffId}|${a.date}`;
      if (!set.has(k)) set.set(k, { staffId: a.staffId, date: a.date });
    }
    return Array.from(set.values());
  }, [assignments.map(a => `${a.staffId}|${a.date}`).sort().join(',')]);

  const dateRange = useMemo(() => {
    if (staffDays.length === 0) return null;
    const dates = [...new Set(staffDays.map(d => d.date))].sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [staffDays]);

  const staffIds = useMemo(
    () => [...new Set(staffDays.map(d => d.staffId))],
    [staffDays],
  );

  const queryKey = ['assignment-time-statuses', dateRange?.from, dateRange?.to, staffIds.join(',')];

  const query = useQuery({
    queryKey,
    enabled: !!dateRange && staffIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (!dateRange) return {
        ltes: [] as AtsLte[],
        trs: [] as AtsTimeReport[],
        workdays: [] as Array<AtsWorkday & { staff_id: string; date: string }>,
        flags: [] as Array<AtsWorkdayFlag & { staff_id: string; date: string }>,
      };

      const { startIso, endIso } = (() => {
        const s = new Date(`${dateRange.from}T00:00:00.000Z`).toISOString();
        const e = new Date(`${dateRange.to}T23:59:59.999Z`).toISOString();
        return { startIso: s, endIso: e };
      })();

      const [lteRes, trRes, wdRes, flagRes] = await Promise.all([
        supabase
          .from('location_time_entries')
          .select('id, staff_id, booking_id, large_project_id, entered_at, exited_at, total_minutes, source, metadata')
          .in('staff_id', staffIds)
          .gte('entered_at', startIso)
          .lte('entered_at', endIso),
        supabase
          .from('time_reports')
          .select('id, staff_id, booking_id, large_project_id, hours_worked, approved, is_subdivision, start_time, end_time, report_date')
          .in('staff_id', staffIds)
          .gte('report_date', dateRange.from)
          .lte('report_date', dateRange.to),
        supabase
          .from('workdays')
          .select('id, staff_id, started_at, ended_at, review_status')
          .in('staff_id', staffIds)
          .gte('started_at', startIso)
          .lte('started_at', endIso),
        supabase
          .from('workday_flags')
          .select('staff_id, work_date, flag_type, severity')
          .in('staff_id', staffIds)
          .gte('work_date', dateRange.from)
          .lte('work_date', dateRange.to),
      ]);

      return {
        ltes: (lteRes.data as any[]) || [],
        trs: (trRes.data as any[]) || [],
        workdays: (wdRes.data as any[]) || [],
        flags: (flagRes.data as any[]) || [],
      };
    },
  });

  // Realtime-invalidering för LTE/TR/workday – samma source-of-truth som tidrapportvyn
  useEffect(() => {
    if (!dateRange) return;
    const ch = supabase
      .channel(`assignment-time-statuses-${dateRange.from}-${dateRange.to}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_time_entries' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_reports' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workdays' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [dateRange?.from, dateRange?.to, queryClient]);

  const statuses = useMemo(() => {
    const map = new Map<string, AtsResult>();
    if (!query.data) return map;

    const dayKey = (staffId: string, iso: string) =>
      `${staffId}|${iso.slice(0, 10)}`;

    // index by staff+day
    const ltesByDay = new Map<string, AtsLte[]>();
    for (const r of query.data.ltes) {
      const k = dayKey(r.staff_id, r.entered_at);
      const arr = ltesByDay.get(k) || [];
      arr.push(r);
      ltesByDay.set(k, arr);
    }
    const trsByDay = new Map<string, AtsTimeReport[]>();
    for (const r of query.data.trs) {
      const k = `${r.staff_id}|${r.work_date}`;
      const arr = trsByDay.get(k) || [];
      arr.push(r);
      trsByDay.set(k, arr);
    }
    const wdByDay = new Map<string, AtsWorkday>();
    for (const r of query.data.workdays) {
      const k = dayKey(r.staff_id, r.started_at || '');
      // ta första (oftast endast en per dag)
      if (!wdByDay.has(k)) wdByDay.set(k, r);
    }
    const flagsByDay = new Map<string, AtsWorkdayFlag[]>();
    for (const r of query.data.flags) {
      const k = `${r.staff_id}|${r.work_date}`;
      const arr = flagsByDay.get(k) || [];
      arr.push(r);
      flagsByDay.set(k, arr);
    }

    for (const a of assignments) {
      const k = `${a.staffId}|${a.date}`;
      const result = computeAssignmentTimeStatus({
        target: { bookingId: a.bookingId, largeProjectId: a.largeProjectId },
        workday: wdByDay.get(k) || null,
        lteRows: ltesByDay.get(k) || [],
        timeReports: trsByDay.get(k) || [],
        workdayFlags: flagsByDay.get(k) || [],
      });
      map.set(assignmentStatusKey(a), result);
    }
    return map;
  }, [query.data, assignments]);

  return {
    statuses,
    isLoading: query.isLoading,
  };
}
