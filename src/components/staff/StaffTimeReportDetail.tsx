import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Calendar, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';

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

export const StaffTimeReportDetail: React.FC<StaffTimeReportDetailProps> = ({
  staffId,
  staffName,
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-detail', staffId, monthStart],
    queryFn: async (): Promise<TimeReportRow[]> => {
      // Fetch time reports and travel logs in parallel
      const [timeResult, travelResult] = await Promise.all([
        supabase
          .from('time_reports')
          .select(`
            id,
            report_date,
            start_time,
            end_time,
            hours_worked,
            overtime_hours,
            description,
            approved,
            large_project_id,
            bookings (
              client,
              booking_number
            ),
            large_projects (
              name
            )
          `)
          .eq('staff_id', staffId)
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .order('report_date', { ascending: false }),
        supabase
          .from('travel_time_logs')
          .select('id, report_date, start_time, end_time, hours_worked, destination_booking_id, from_address, to_address')
          .eq('staff_id', staffId)
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .not('end_time', 'is', null),
      ]);

      if (timeResult.error) throw timeResult.error;
      if (travelResult.error) throw travelResult.error;

      // Fetch destination booking names for travel logs
      const bookingIds = (travelResult.data || [])
        .map(t => t.destination_booking_id)
        .filter(Boolean) as string[];

      let destBookingMap = new Map<string, string>();
      if (bookingIds.length > 0) {
        const { data: destBookings } = await supabase
          .from('bookings')
          .select('id, client')
          .in('id', bookingIds);
        for (const b of destBookings || []) {
          destBookingMap.set(b.id, b.client);
        }
      }

      // Map time reports
      const workRows: TimeReportRow[] = (timeResult.data || []).map((r: any) => {
        // Use large project name when available, otherwise booking client
        const displayClient = r.large_projects?.name || r.bookings?.client || '-';
        const displayNumber = r.large_project_id ? null : (r.bookings?.booking_number || null);
        return {
          id: r.id,
          report_date: r.report_date,
          start_time: r.start_time,
          end_time: r.end_time,
          hours_worked: r.hours_worked,
          overtime_hours: r.overtime_hours,
          description: r.description,
          approved: r.approved,
          booking_client: displayClient,
          booking_number: displayNumber,
          type: 'work' as const,
        };
      });

      // Map travel logs
      const travelRows: TimeReportRow[] = (travelResult.data || []).map(t => {
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

      // Merge and sort by date + start_time
      return [...workRows, ...travelRows].sort((a, b) => {
        const dateComp = a.report_date.localeCompare(b.report_date);
        if (dateComp !== 0) return -dateComp; // descending date
        return (a.start_time || '').localeCompare(b.start_time || '');
      });
    },
  });

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
  const totalTravelHours = reports.filter(r => r.type === 'travel').reduce((sum, r) => sum + r.hours_worked, 0);

  return (
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
              {reports.map(report => (
                <TableRow key={report.id} className={report.type === 'travel' ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(new Date(report.report_date), 'EEE d MMM', { locale: sv })}
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
              ))}
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
  );
};
