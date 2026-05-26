import { useState, useEffect } from 'react';
import { MobileTimeReport } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { Clock, Loader2 } from 'lucide-react';
import { formatHoursMinutes } from '@/utils/formatHours';

interface JobTimeTabProps {
  bookingId: string;
  timeReports?: any[];
}

const JobTimeTab = ({ bookingId, timeReports }: JobTimeTabProps) => {
  const reports: MobileTimeReport[] = (timeReports || []).filter(
    (r: any) => r.booking_id === bookingId
  );
  const isLoading = false;

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">Inga tidrapporter för det här jobbet</p>
      </div>
    );
  }

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + r.overtime_hours, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-primary/5 border-primary/20 p-3 text-center">
          <p className="text-xs text-muted-foreground">Totalt</p>
          <p className="text-xl font-bold text-foreground">{formatHoursMinutes(totalHours)}</p>
        </div>
        <div className="rounded-xl border bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Övertid</p>
          <p className="text-xl font-bold text-foreground">{formatHoursMinutes(totalOvertime)}</p>
        </div>
      </div>

      {reports.map(report => (
        <div key={report.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">
                {format(parseISO(report.report_date), 'd MMMM yyyy')}
              </p>
              <p className="text-xs text-muted-foreground">
                {report.start_time?.slice(0, 5) || '—'} – {report.end_time?.slice(0, 5) || '—'}
                {report.break_time > 0 && <span> · {report.break_time}h break</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sm">{formatHoursMinutes(report.hours_worked)}</p>
              {report.overtime_hours > 0 && (
                <p className="text-[10px] text-primary font-medium">+{formatHoursMinutes(report.overtime_hours)} OT</p>
              )}
            </div>
          </div>
          {report.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{report.description}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default JobTimeTab;
