import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';
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
      const { data, error } = await supabase
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
          bookings!inner (
            client,
            booking_number
          )
        `)
        .eq('staff_id', staffId)
        .gte('report_date', monthStart)
        .lte('report_date', monthEnd)
        .order('report_date', { ascending: false });

      if (error) throw error;

      return (data || []).map((r: any) => ({
        id: r.id,
        report_date: r.report_date,
        start_time: r.start_time,
        end_time: r.end_time,
        hours_worked: r.hours_worked,
        overtime_hours: r.overtime_hours,
        description: r.description,
        approved: r.approved,
        booking_client: r.bookings?.client || '-',
        booking_number: r.bookings?.booking_number || null,
      }));
    },
  });

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);

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
                <TableRow key={report.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(new Date(report.report_date), 'EEE d MMM', { locale: sv })}
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-[140px]">
                      {report.booking_client}
                      {report.booking_number && (
                        <span className="text-muted-foreground text-xs ml-1">
                          #{report.booking_number}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{report.start_time || '-'}</TableCell>
                  <TableCell>{report.end_time || '-'}</TableCell>
                  <TableCell className="text-right">{formatHoursMinutes(report.hours_worked)}</TableCell>
                  <TableCell className="text-right">
                    {(report.overtime_hours || 0) > 0
                      ? formatHoursMinutes(report.overtime_hours!)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {report.approved ? (
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
            </TableBody>
          </Table>
        </div>
      )}
    </PremiumCard>
  );
};
