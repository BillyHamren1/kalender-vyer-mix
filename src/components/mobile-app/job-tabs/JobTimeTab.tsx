import { useState, useEffect } from 'react';
import { mobileApi, MobileTimeReport } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, Loader2 } from 'lucide-react';

interface JobTimeTabProps {
  bookingId: string;
}

const JobTimeTab = ({ bookingId }: JobTimeTabProps) => {
  const [reports, setReports] = useState<MobileTimeReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    mobileApi.getTimeReports()
      .then(res => {
        // Filter to this booking
        const filtered = res.time_reports.filter(r => r.booking_id === bookingId);
        setReports(filtered);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [bookingId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
        <p className="text-sm text-muted-foreground">Inga tidrapporter för detta jobb</p>
      </div>
    );
  }

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + r.overtime_hours, 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-primary/5 border-primary/20 p-3 text-center">
          <p className="text-xs text-muted-foreground">Totalt</p>
          <p className="text-xl font-bold text-foreground">{totalHours}h</p>
        </div>
        <div className="rounded-xl border bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Övertid</p>
          <p className="text-xl font-bold text-foreground">{totalOvertime}h</p>
        </div>
      </div>

      {/* Report list */}
      {reports.map(report => (
        <div key={report.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">
                {format(parseISO(report.report_date), 'd MMMM yyyy', { locale: sv })}
              </p>
              <p className="text-xs text-muted-foreground">
                {report.start_time?.slice(0, 5) || '—'} – {report.end_time?.slice(0, 5) || '—'}
                {report.break_time > 0 && <span> · {report.break_time}h rast</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-sm">{report.hours_worked}h</p>
              {report.overtime_hours > 0 && (
                <p className="text-[10px] text-primary font-medium">+{report.overtime_hours}h öt</p>
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
