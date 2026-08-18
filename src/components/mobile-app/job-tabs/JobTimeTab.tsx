import { useState } from 'react';
import { MobileTimeReport } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { Clock, Plus } from 'lucide-react';
import { formatHoursMinutes } from '@/utils/formatHours';
import { Button } from '@/components/ui/button';
import QuickTimeEntrySheet from '@/components/mobile-app/time/QuickTimeEntrySheet';

interface JobTimeTabProps {
  bookingId: string;
  bookingLabel?: string;
  timeReports?: any[];
  canReportTime?: boolean;
}

const JobTimeTab = ({ bookingId, bookingLabel = 'Det här jobbet', timeReports, canReportTime = true }: JobTimeTabProps) => {
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const reports: MobileTimeReport[] = (timeReports || []).filter(
    (r: any) => r.booking_id === bookingId
  );
  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + r.overtime_hours, 0);

  return (
    <div className="space-y-3">
      {canReportTime ? (
        <Button
          type="button"
          onClick={() => setQuickEntryOpen(true)}
          className="w-full h-12 rounded-xl text-sm font-semibold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Rapportera tid på jobbet
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-xs font-semibold text-foreground">Jobbinformation</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Du kan läsa jobbet, men tid rapporteras bara på jobb du är bemannad på.</p>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="text-center py-8 rounded-xl border border-dashed">
          <Clock className="w-9 h-9 mx-auto text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground">Ingen rapporterad tid ännu</p>
        </div>
      ) : (
        <>
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
        </>
      )}

      {canReportTime && <QuickTimeEntrySheet
        open={quickEntryOpen}
        onOpenChange={setQuickEntryOpen}
        fixedTarget={{ type: 'booking', id: bookingId, label: bookingLabel }}
      />}
    </div>
  );
};

export default JobTimeTab;
