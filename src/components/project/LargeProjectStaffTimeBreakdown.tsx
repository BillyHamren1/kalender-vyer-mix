import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, CheckCircle, Clock } from 'lucide-react';
import type { StaffTimeReport } from '@/types/projectEconomy';
import { formatHoursMinutes } from '@/utils/formatHours';
import type { LargeProjectBookingLink } from '@/types/largeProject';

interface Props {
  timeReportsByBooking: Record<string, StaffTimeReport[]>;
  bookings: LargeProjectBookingLink[];
}

const fmt = (amount: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const formatTime = (start: string | null, end: string | null) => {
  if (!start && !end) return '–';
  const s = start ? start.substring(0, 5) : '?';
  const e = end ? end.substring(0, 5) : '?';
  return `${s}–${e}`;
};

export const LargeProjectStaffTimeBreakdown = ({ timeReportsByBooking, bookings }: Props) => {
  const entries = Object.entries(timeReportsByBooking).filter(([, reports]) => reports.length > 0);

  // Aggregate totals across all bookings
  let grandHours = 0;
  let grandCost = 0;
  let pending = 0;

  entries.forEach(([, reports]) => {
    reports.forEach((r) => {
      grandHours += (r.total_hours || 0) + (r.overtime_hours || 0);
      grandCost += r.total_cost || 0;
      (r.detailed_reports || []).forEach((d) => {
        if (!d.approved) pending += 1;
      });
    });
  });

  const getBookingLabel = (bookingId: string) => {
    const link = bookings.find((b) => b.booking_id === bookingId);
    const num = link?.booking?.booking_number || bookingId.slice(0, 8);
    const client = link?.booking?.client || '';
    return client ? `${num} • ${client}` : num;
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-medium">Rapporterad tid — detaljerat</CardTitle>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Totalt</p>
          <p className="text-sm font-semibold">
            {formatHoursMinutes(grandHours)} · {fmt(grandCost)}
            {pending > 0 && (
              <span className="ml-2 text-xs text-amber-600">({pending} väntar)</span>
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-center py-6 text-sm">
            Inga tidrapporter registrerade på något av projektets bokningar.
          </p>
        ) : (
          <div className="space-y-6">
            {entries.map(([bookingId, reports]) => {
              const bookingHours = reports.reduce(
                (s, r) => s + (r.total_hours || 0) + (r.overtime_hours || 0),
                0
              );
              const bookingCost = reports.reduce((s, r) => s + (r.total_cost || 0), 0);

              return (
                <div key={bookingId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">
                      {getBookingLabel(bookingId)}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {formatHoursMinutes(bookingHours)} · {fmt(bookingCost)}
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Personal / Datum</TableHead>
                        <TableHead className="text-xs">Tid</TableHead>
                        <TableHead className="text-xs text-right">Timmar</TableHead>
                        <TableHead className="text-xs text-right">Timpris</TableHead>
                        <TableHead className="text-xs text-right">Kostnad</TableHead>
                        <TableHead className="text-xs text-center w-16">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((staff) => (
                        <>
                          <TableRow
                            key={`${bookingId}-${staff.staff_id}`}
                            className="bg-muted/40 hover:bg-muted/40"
                          >
                            <TableCell colSpan={2} className="font-semibold text-sm">
                              {staff.staff_name}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-muted-foreground">
                              {formatHoursMinutes(staff.total_hours + staff.overtime_hours)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {fmt(staff.hourly_rate)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-muted-foreground">
                              {fmt(staff.total_cost)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          {(staff.detailed_reports || []).map((report) => (
                            <TableRow key={report.id}>
                              <TableCell className="pl-8 text-xs text-muted-foreground">
                                {report.report_date}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatTime(report.start_time, report.end_time)}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {formatHoursMinutes(report.hours_worked)}
                                {report.overtime_hours > 0 && (
                                  <span className="text-muted-foreground ml-1">
                                    (+{formatHoursMinutes(report.overtime_hours)} öt)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">
                                {fmt(report.hourly_rate)}
                              </TableCell>
                              <TableCell className="text-xs text-right">{fmt(report.cost)}</TableCell>
                              <TableCell className="text-center">
                                {report.approved ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-600 mx-auto" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-amber-600 mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
