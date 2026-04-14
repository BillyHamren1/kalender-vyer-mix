import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Calendar, Car, AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { detectAnomalies, getAnomaliesForDate, type Anomaly, type TimeEntry, type TravelEntry, type TeamMemberReport, type AssignmentDate } from '@/lib/timeReportAnomalies';
import { AnomalyDialog } from './AnomalyDialog';
import { DailyOverviewDialog } from './DailyOverviewDialog';

interface StaffTimeReportDetailProps {
  staffId: string;
  staffName: string;
}

interface TimeReportRow {
  id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number | null;
  description: string | null;
  approved: boolean | null;
  booking_client: string;
  booking_number: string | null;
  type: 'work' | 'travel';
}

interface RawTravelLog {
  id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  destination_booking_id: string | null;
  from_address: string | null;
  to_address: string | null;
  from_latitude: number | null;
  from_longitude: number | null;
  to_latitude: number | null;
  to_longitude: number | null;
}

export const StaffTimeReportDetail: React.FC<StaffTimeReportDetailProps> = ({
  staffId,
  staffName,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [anomalyDate, setAnomalyDate] = useState<string | null>(null);
  const [dailyOverviewDate, setDailyOverviewDate] = useState<string | null>(null);

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  // Main data query
  const { data: queryData, isLoading } = useQuery({
    queryKey: ['staff-time-reports-detail', staffId, monthStart],
    queryFn: async () => {
      const [timeResult, travelResult] = await Promise.all([
        supabase
          .from('time_reports')
          .select(`
            id, report_date, start_time, end_time, hours_worked,
            overtime_hours, description, approved, booking_id,
            bookings (client, booking_number, large_project_id)
          `)
          .eq('staff_id', staffId)
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .order('report_date', { ascending: false }),
        supabase
          .from('travel_time_logs')
          .select('id, report_date, start_time, end_time, hours_worked, destination_booking_id, from_address, to_address, from_latitude, from_longitude, to_latitude, to_longitude')
          .eq('staff_id', staffId)
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .not('end_time', 'is', null),
      ]);

      if (timeResult.error) throw timeResult.error;
      if (travelResult.error) throw travelResult.error;

      const rawTravel: RawTravelLog[] = (travelResult.data || []).map((t: any) => ({
        id: t.id,
        report_date: t.report_date,
        start_time: t.start_time,
        end_time: t.end_time,
        hours_worked: t.hours_worked,
        destination_booking_id: t.destination_booking_id,
        from_address: t.from_address,
        to_address: t.to_address,
        from_latitude: t.from_latitude,
        from_longitude: t.from_longitude,
        to_latitude: t.to_latitude,
        to_longitude: t.to_longitude,
      }));

      // Fetch destination booking names + large project names
      const travelBookingIds = rawTravel.map(t => t.destination_booking_id).filter(Boolean) as string[];
      const lpIds = (timeResult.data || [])
        .map((r: any) => r.bookings?.large_project_id)
        .filter(Boolean) as string[];

      let destBookingMap = new Map<string, string>();
      let lpNameMap = new Map<string, string>();

      const [destRes, lpRes] = await Promise.all([
        travelBookingIds.length > 0
          ? supabase.from('bookings').select('id, client').in('id', travelBookingIds)
          : null,
        lpIds.length > 0
          ? supabase.from('large_projects').select('id, name').in('id', [...new Set(lpIds)])
          : null,
      ]);

      for (const b of destRes?.data || []) destBookingMap.set(b.id, b.client);
      for (const lp of lpRes?.data || []) lpNameMap.set(lp.id, lp.name);

      // Map time reports
      const workRows: TimeReportRow[] = (timeResult.data || []).map((r: any) => {
        const lpName = r.bookings?.large_project_id
          ? lpNameMap.get(r.bookings.large_project_id)
          : null;
        return {
          id: r.id,
          report_date: r.report_date,
          start_time: r.start_time,
          end_time: r.end_time,
          hours_worked: r.hours_worked,
          overtime_hours: r.overtime_hours,
          description: r.description,
          approved: r.approved,
          booking_client: lpName || r.bookings?.client || '-',
          booking_number: lpName ? null : (r.bookings?.booking_number || null),
          type: 'work' as const,
        };
      });

      // Map travel logs
      const travelRows: TimeReportRow[] = rawTravel.map(t => {
        const destClient = t.destination_booking_id
          ? destBookingMap.get(t.destination_booking_id)
          : null;
        const clientLabel = destClient ? `Resa → ${destClient}` : 'Resa';
        return {
          id: t.id,
          report_date: t.report_date,
          start_time: t.start_time,
          end_time: t.end_time,
          hours_worked: t.hours_worked,
          overtime_hours: null,
          description: [t.from_address, t.to_address].filter(Boolean).join(' → ') || null,
          approved: null,
          booking_client: clientLabel,
          booking_number: null,
          type: 'travel' as const,
        };
      });

      const reports = [...workRows, ...travelRows].sort((a, b) => {
        const dateComp = a.report_date.localeCompare(b.report_date);
        if (dateComp !== 0) return -dateComp;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

      return { reports, rawTravel };
    },
  });

  // Team data + assignments query for anomaly detection
  const { data: teamData } = useQuery({
    queryKey: ['staff-team-anomaly-data', staffId, monthStart],
    queryFn: async (): Promise<{ teamReports: TeamMemberReport[]; assignments: AssignmentDate[] }> => {
      // Get this staff's assignments for the month
      const { data: bsa } = await supabase
        .from('booking_staff_assignments')
        .select('booking_id, assignment_date')
        .eq('staff_id', staffId)
        .gte('assignment_date', monthStart)
        .lte('assignment_date', monthEnd);

      if (!bsa || bsa.length === 0) return { teamReports: [], assignments: [] };

      const assignments: AssignmentDate[] = bsa.map(a => ({
        date: a.assignment_date,
        booking_id: a.booking_id,
      }));

      // Get team members for same bookings+dates
      const bookingDatePairs = bsa.map(a => a.booking_id);
      const uniqueBookingIds = [...new Set(bookingDatePairs)];

      const { data: teamBsa } = await supabase
        .from('booking_staff_assignments')
        .select('staff_id, booking_id, assignment_date')
        .in('booking_id', uniqueBookingIds.slice(0, 50))
        .gte('assignment_date', monthStart)
        .lte('assignment_date', monthEnd)
        .neq('staff_id', staffId);

      if (!teamBsa || teamBsa.length === 0) return { teamReports: [], assignments };

      const teamStaffIds = [...new Set(teamBsa.map(t => t.staff_id))];

      // Get team members' time reports
      const { data: teamTr } = await supabase
        .from('time_reports')
        .select('staff_id, report_date, start_time, end_time, booking_id, staff_members!inner(name)')
        .in('staff_id', teamStaffIds.slice(0, 30))
        .gte('report_date', monthStart)
        .lte('report_date', monthEnd);

      const teamReports: TeamMemberReport[] = (teamTr || []).map((r: any) => ({
        staff_name: r.staff_members?.name || 'Okänd',
        report_date: r.report_date,
        start_time: r.start_time,
        end_time: r.end_time,
        booking_id: r.booking_id,
      }));

      return { teamReports, assignments };
    },
    enabled: !isLoading && !!queryData,
  });

  const reports = queryData?.reports || [];
  const rawTravel = queryData?.rawTravel || [];

  // Compute anomalies
  const anomalies = useMemo<Anomaly[]>(() => {
    if (!teamData) return [];

    const timeEntries: TimeEntry[] = reports.map(r => ({
      id: r.id,
      report_date: r.report_date,
      start_time: r.start_time,
      end_time: r.end_time,
      hours_worked: r.hours_worked,
      type: r.type,
    }));

    const travelEntries: TravelEntry[] = rawTravel.map(t => ({
      id: t.id,
      report_date: t.report_date,
      start_time: t.start_time,
      end_time: t.end_time,
      hours_worked: t.hours_worked,
      from_latitude: t.from_latitude,
      from_longitude: t.from_longitude,
      to_latitude: t.to_latitude,
      to_longitude: t.to_longitude,
      from_address: t.from_address,
      to_address: t.to_address,
    }));

    return detectAnomalies(
      timeEntries,
      travelEntries,
      teamData.teamReports,
      teamData.assignments,
      staffName,
    );
  }, [reports, rawTravel, teamData, staffName]);

  const anomalyCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of anomalies) {
      map.set(a.date, (map.get(a.date) || 0) + 1);
    }
    return map;
  }, [anomalies]);

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
  const totalTravelHours = reports.filter(r => r.type === 'travel').reduce((sum, r) => sum + r.hours_worked, 0);

  // Dialog data
  const dialogAnomalies = anomalyDate ? getAnomaliesForDate(anomalies, anomalyDate) : [];
  const dialogTravelRoutes = anomalyDate
    ? rawTravel
        .filter(t => t.report_date === anomalyDate)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        .map(t => ({
          start_time: t.start_time,
          from_address: t.from_address,
          to_address: t.to_address,
          hours_worked: t.hours_worked,
        }))
    : [];

  return (
    <>
      <PremiumCard
        icon={Calendar}
        title={format(currentMonth, 'MMMM yyyy', { locale: sv })}
        subtitle={`${reports.length} rapporter · ${formatHoursMinutes(totalHours)} totalt`}
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
            className="rounded-xl"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Förra
          </Button>
          <span className="text-sm font-medium capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: sv })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
            className="rounded-xl"
          >
            Nästa
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Summary badges */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {formatHoursMinutes(totalHours)} totalt
          </Badge>
          {totalOvertime > 0 && (
            <Badge variant="outline" className="text-xs">
              Övertid: {formatHoursMinutes(totalOvertime)}
            </Badge>
          )}
          {totalTravelHours > 0 && (
            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
              <Car className="h-3 w-3 mr-1" />
              Restid: {formatHoursMinutes(totalTravelHours)}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {reports.length} rapporter
          </Badge>
          {anomalies.length > 0 && (
            <Badge
              variant="destructive"
              className="text-xs cursor-pointer"
              onClick={() => setAnomalyDate(anomalies[0].date)}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {anomalies.length} avvikelse{anomalies.length !== 1 ? 'r' : ''}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Inga tidrapporter för denna månad.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Kund</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Slut</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-right">Övertid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map(report => {
                  const dateAnomalyCount = anomalyCountByDate.get(report.report_date) || 0;
                  return (
                    <TableRow key={report.id} className={report.type === 'travel' ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {format(new Date(report.report_date), 'EEE d MMM', { locale: sv })}
                          {dateAnomalyCount > 0 && (
                            <button
                              onClick={() => setAnomalyDate(report.report_date)}
                              className="ml-1 text-orange-500 hover:text-orange-600 transition-colors"
                              title={`${dateAnomalyCount} avvikelse${dateAnomalyCount !== 1 ? 'r' : ''}`}
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="truncate max-w-[140px] flex items-center gap-1">
                          {report.type === 'travel' && <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                          <span>
                            {report.booking_client}
                            {report.booking_number && (
                              <span className="text-muted-foreground text-xs ml-1">
                                #{report.booking_number}
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{report.start_time ? report.start_time.slice(0, 5) : '-'}</TableCell>
                      <TableCell>{report.end_time ? report.end_time.slice(0, 5) : '-'}</TableCell>
                      <TableCell className="text-right">{formatHoursMinutes(report.hours_worked)}</TableCell>
                      <TableCell className="text-right">
                        {report.type === 'travel'
                          ? '-'
                          : (report.overtime_hours || 0) > 0
                            ? formatHoursMinutes(report.overtime_hours!)
                            : '-'}
                      </TableCell>
                      <TableCell>
                        {report.type === 'travel' ? (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                            Resa
                          </Badge>
                        ) : report.approved ? (
                          <Badge variant="default" className="text-[10px] bg-primary/20 text-primary border-0">
                            Godkänd
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Väntande
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell colSpan={4}>TOTALT</TableCell>
                  <TableCell className="text-right">{formatHoursMinutes(totalHours)}</TableCell>
                  <TableCell className="text-right">
                    {totalOvertime > 0 ? formatHoursMinutes(totalOvertime) : '-'}
                  </TableCell>
                  <TableCell />
                </TableRow>
                {totalTravelHours > 0 && (
                  <TableRow className="text-xs text-muted-foreground">
                    <TableCell colSpan={4} className="italic">varav restid</TableCell>
                    <TableCell className="text-right italic">{formatHoursMinutes(totalTravelHours)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PremiumCard>

      <AnomalyDialog
        open={!!anomalyDate}
        onOpenChange={(open) => !open && setAnomalyDate(null)}
        date={anomalyDate}
        anomalies={dialogAnomalies}
        travelRoutes={dialogTravelRoutes}
      />
    </>
  );
};
