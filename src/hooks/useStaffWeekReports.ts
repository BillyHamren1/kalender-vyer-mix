import { useQuery } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface WeekProjectEntry {
  booking_id: string | null;
  large_project_id: string | null;
  location_id: string | null;
  label: string;
  hours: number;
  color: string | null;
}

export interface WeekDayEntry {
  date: string; // yyyy-MM-dd
  totalHours: number;
  hasOpen: boolean;
  approvedHours: number;
  projects: WeekProjectEntry[];
}

export interface StaffWeekReports {
  staffId: string;
  weekStart: string;
  weekEnd: string;
  days: WeekDayEntry[];
  totalHours: number;
}

async function fetchStaffWeekReports(staffId: string, weekStart: Date): Promise<StaffWeekReports> {
  const start = format(weekStart, 'yyyy-MM-dd');
  const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const [trRes, bRes, lpRes, locRes] = await Promise.all([
    supabase
      .from('time_reports')
      .select(
        'id, report_date, hours_worked, start_time, end_time, booking_id, large_project_id, location_id, approved, is_subdivision',
      )
      .eq('staff_id', staffId)
      .gte('report_date', start)
      .lte('report_date', end)
      .limit(1000),
    supabase.from('bookings').select('id, client, booking_number'),
    supabase.from('large_projects').select('id, name, project_number').limit(1000),
    supabase.from('organization_locations').select('id, name').limit(1000),
  ]);

  const bookings = new Map<string, any>((bRes.data || []).map((b: any) => [b.id, b]));
  const lps = new Map<string, any>((lpRes.data || []).map((p: any) => [p.id, p]));
  const locs = new Map<string, any>((locRes.data || []).map((l: any) => [l.id, l]));

  const daysMap = new Map<string, WeekDayEntry>();
  for (let i = 0; i < 7; i++) {
    const d = format(addDays(weekStart, i), 'yyyy-MM-dd');
    daysMap.set(d, { date: d, totalHours: 0, hasOpen: false, approvedHours: 0, projects: [] });
  }

  for (const row of (trRes.data || []) as any[]) {
    if (row.is_subdivision) continue; // projektsummering, filtreras bort
    const day = daysMap.get(row.report_date);
    if (!day) continue;
    const hours = Number(row.hours_worked || 0);
    day.totalHours += hours;
    if (row.approved) day.approvedHours += hours;
    if (!row.end_time) day.hasOpen = true;

    let label = 'Okänt';
    let color: string | null = null;
    if (row.booking_id && bookings.has(row.booking_id)) {
      const b = bookings.get(row.booking_id);
      label = b.client || b.booking_number || 'Bokning';
    } else if (row.large_project_id && lps.has(row.large_project_id)) {
      const p = lps.get(row.large_project_id);
      label = p.name || p.project_number || 'Stort projekt';
    } else if (row.location_id && locs.has(row.location_id)) {
      label = locs.get(row.location_id).name || 'Plats';
    }

    const key = row.booking_id || row.large_project_id || row.location_id || label;
    const existing = day.projects.find((p) => (p.booking_id || p.large_project_id || p.location_id || p.label) === key);
    if (existing) {
      existing.hours += hours;
    } else {
      day.projects.push({
        booking_id: row.booking_id ?? null,
        large_project_id: row.large_project_id ?? null,
        location_id: row.location_id ?? null,
        label,
        hours,
        color,
      });
    }
  }

  const days = [...daysMap.values()];
  const totalHours = days.reduce((s, d) => s + d.totalHours, 0);
  return { staffId, weekStart: start, weekEnd: end, days, totalHours };
}

export function useStaffWeekReports(staffId: string | null, weekStart: Date) {
  return useQuery({
    queryKey: ['staff-week-reports', staffId, format(weekStart, 'yyyy-MM-dd')],
    queryFn: () => fetchStaffWeekReports(staffId as string, weekStart),
    enabled: !!staffId,
    refetchInterval: 60_000,
  });
}
