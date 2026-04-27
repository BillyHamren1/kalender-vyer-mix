import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { aggregateDayRows, type AdminDayRow } from '@/lib/timeReview/dayAggregation';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

interface Params {
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD inclusive
}

export function useAdminDayReviewRows({ fromDate, toDate }: Params) {
  // Refetch on relevant table changes within window (debounced).
  useRealtimeInvalidation({
    channelName: `admin-day-review-${fromDate}-${toDate}`,
    tables: [
      { table: 'workdays', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'time_reports', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'travel_time_logs', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'location_time_entries', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'workday_flags', events: ['INSERT', 'UPDATE', 'DELETE'] },
    ],
    queryKeys: [['admin-day-review', fromDate, toDate]],
    debounceMs: 500,
  });

  return useQuery({
    queryKey: ['admin-day-review', fromDate, toDate],
    refetchInterval: 60_000,
    queryFn: async (): Promise<AdminDayRow[]> => {
      // started_at uses tstz — convert range to ISO bounds so we catch
      // workdays that started anywhere in the local span.
      const startBound = new Date(`${fromDate}T00:00:00`);
      const endBound = new Date(`${toDate}T00:00:00`);
      endBound.setDate(endBound.getDate() + 1); // exclusive upper

      const [wdRes, trRes, tvRes, leRes, flRes, stRes] = await Promise.all([
        supabase
          .from('workdays')
          .select('id, staff_id, started_at, ended_at, review_status, review_reasons, notes')
          .gte('started_at', startBound.toISOString())
          .lt('started_at', endBound.toISOString()),
        supabase
          .from('time_reports')
          .select('id, staff_id, report_date, hours_worked, start_time, end_time, source, is_subdivision')
          .gte('report_date', fromDate)
          .lte('report_date', toDate),
        supabase
          .from('travel_time_logs')
          .select('id, staff_id, report_date, hours_worked, start_time, end_time')
          .gte('report_date', fromDate)
          .lte('report_date', toDate),
        supabase
          .from('location_time_entries')
          .select('id, staff_id, entry_date, entered_at, exited_at, total_minutes, booking_id, large_project_id, location_id, source')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate),
        supabase
          .from('workday_flags')
          .select('id, staff_id, flag_date, flag_type, severity, title, resolved')
          .gte('flag_date', fromDate)
          .lte('flag_date', toDate)
          .eq('resolved', false),
        supabase.from('staff_members').select('id, name, role, color'),
      ]);

      if (wdRes.error) throw wdRes.error;
      if (trRes.error) throw trRes.error;
      if (tvRes.error) throw tvRes.error;
      if (leRes.error) throw leRes.error;
      if (flRes.error) throw flRes.error;
      if (stRes.error) throw stRes.error;

      return aggregateDayRows({
        fromDate,
        toDate,
        workdays: (wdRes.data || []) as any,
        timeReports: (trRes.data || []) as any,
        travelLogs: (tvRes.data || []) as any,
        locationEntries: (leRes.data || []) as any,
        flags: (flRes.data || []) as any,
        staff: (stRes.data || []) as any,
      });
    },
  });
}
