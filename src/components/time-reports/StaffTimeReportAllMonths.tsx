import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface StaffTimeReportAllMonthsProps {
  staffId: string;
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
  approved_at: string | null;
  approved_by: string | null;
  booking_id: string;
  bookings: {
    client: string;
    booking_number: string | null;
  } | null;
}

const StaffTimeReportAllMonths: React.FC<StaffTimeReportAllMonthsProps> = ({ staffId }) => {
  const { data: reports, isLoading } = useQuery({
    queryKey: ['staff-all-time-reports', staffId],
    queryFn: async () => {
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
          approved_at,
          approved_by,
          booking_id,
          bookings!time_reports_booking_id_fkey (
            client,
            booking_number
          )
        `)
        .eq('staff_id', staffId)
        .order('report_date', { ascending: false });
      if (error) throw error;
      return data as unknown as TimeReportRow[];
    },
    enabled: !!staffId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Laddar tidrapporter...</span>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Inga tidrapporter hittades.
      </div>
    );
  }

  // Group by month (YYYY-MM)
  const grouped: Record<string, TimeReportRow[]> = {};
  for (const r of reports) {
    const key = r.report_date.substring(0, 7); // "2026-02"
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {sortedMonths.map((monthKey) => {
        const monthReports = grouped[monthKey];
        const monthDate = parseISO(monthKey + '-01');
        const totalHours = monthReports.reduce((s, r) => s + r.hours_worked, 0);
        const totalOT = monthReports.reduce((s, r) => s + (r.overtime_hours || 0), 0);
        const approvedCount = monthReports.filter(r => r.approved).length;

        return (
          <div key={monthKey} className="border border-border rounded-lg overflow-hidden">
            {/* Month header */}
            <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-base capitalize">
                {format(monthDate, 'MMMM yyyy', { locale: sv })}
              </h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{monthReports.length} rapporter</span>
                <span>{totalHours.toFixed(1)} tim</span>
                {totalOT > 0 && <span className="text-orange-600">{totalOT.toFixed(1)} OB</span>}
                <span className="text-green-600">{approvedCount}/{monthReports.length} godkända</span>
              </div>
            </div>

            {/* Report rows */}
            <div className="divide-y divide-border">
              {monthReports.map((report) => (
                <div key={report.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Date */}
                    <div className="w-20 shrink-0">
                      <div className="text-sm font-medium">
                        {format(parseISO(report.report_date), 'd MMM', { locale: sv })}
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {format(parseISO(report.report_date), 'EEEE', { locale: sv })}
                      </div>
                    </div>

                    {/* Time range */}
                    <div className="w-24 shrink-0 text-sm text-muted-foreground">
                      {report.start_time && report.end_time
                        ? `${report.start_time.substring(0, 5)} – ${report.end_time.substring(0, 5)}`
                        : '–'}
                    </div>

                    {/* Client / booking */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {report.bookings?.client || 'Okänd kund'}
                      </div>
                      {report.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {report.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {/* Hours */}
                    <Badge variant="secondary" className="text-xs">
                      {report.hours_worked}h
                    </Badge>
                    {report.overtime_hours && report.overtime_hours > 0 && (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                        {report.overtime_hours}h OB
                      </Badge>
                    )}

                    {/* Approval status */}
                    {report.approved ? (
                      <div className="flex items-center gap-1.5" title={`Godkänd${report.approved_by ? ` av ${report.approved_by}` : ''}${report.approved_at ? ` ${format(parseISO(report.approved_at), 'd MMM HH:mm', { locale: sv })}` : ''}`}>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-700 max-w-[100px] truncate">
                          {report.approved_by || 'Godkänd'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5" title="Väntar på godkännande">
                        <Clock className="h-4 w-4 text-amber-500" />
                        <span className="text-xs text-amber-600">Väntande</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StaffTimeReportAllMonths;
