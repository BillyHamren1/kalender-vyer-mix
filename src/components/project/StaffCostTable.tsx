import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Settings, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import type { StaffTimeReport, EconomySummary } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor } from '@/types/projectEconomy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface StaffCostTableProps {
  timeReports: StaffTimeReport[];
  summary: EconomySummary;
  bookingId: string | null;
  onOpenBudgetSettings: () => void;
}

export const StaffCostTable = ({ timeReports, summary, bookingId, onOpenBudgetSettings }: StaffCostTableProps) => {
  const queryClient = useQueryClient();
  const status = getDeviationStatus(summary.staffDeviationPercent);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleApprove = async (reportIds: string[], label: string) => {
    try {
      const { error } = await supabase
        .from('time_reports')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: 'Projektledare'
        })
        .in('id', reportIds);

      if (error) throw error;
      
      await queryClient.invalidateQueries({ queryKey: ['project-time-reports', bookingId] });
      await queryClient.invalidateQueries({ queryKey: ['pending-time-reports'] });
      
      toast.success(`Tidrapport för ${label} godkänd`);
    } catch (error) {
      console.error('Error approving time report:', error);
      toast.error('Kunde inte godkänna tidrapporten');
    }
  };

  const allReports = timeReports.flatMap(r => r.detailed_reports || []);
  const pendingCount = allReports.filter(r => !r.approved).length;
  const allApproved = pendingCount === 0;

  const formatTime = (start: string | null, end: string | null) => {
    if (!start && !end) return '–';
    const s = start ? start.substring(0, 5) : '?';
    const e = end ? end.substring(0, 5) : '?';
    return `${s}–${e}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Personal & Timmar</CardTitle>
        <Button variant="outline" size="sm" onClick={onOpenBudgetSettings}>
          <Settings className="h-4 w-4 mr-2" />
          Budget
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted rounded-lg">
          <p className="text-sm">
            <span className="font-medium">Timbudget:</span>{' '}
            {summary.budgetedHours} tim @ {summary.hourlyRate} kr/tim = {formatCurrency(summary.staffBudget)}
          </p>
        </div>

        {timeReports.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personal / Datum</TableHead>
                  <TableHead>Tid</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-right">Kostnad</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeReports.map((staff) => (
                  <>
                    {/* Staff grouping header */}
                    <TableRow key={`staff-${staff.staff_id}`} className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={2} className="font-semibold">
                        {staff.staff_name}
                      </TableCell>
                      <TableCell className="text-right font-medium text-muted-foreground">
                        {staff.total_hours.toFixed(1)} h
                      </TableCell>
                      <TableCell className="text-right font-medium text-muted-foreground">
                        {formatCurrency(staff.total_cost)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    {/* Individual report rows */}
                    {(staff.detailed_reports || []).map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="pl-8 text-muted-foreground">
                          {report.report_date}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatTime(report.start_time, report.end_time)}
                        </TableCell>
                        <TableCell className="text-right">
                          {report.hours_worked.toFixed(1)} h
                          {report.overtime_hours > 0 && (
                            <span className="text-muted-foreground text-xs ml-1">
                              (+{report.overtime_hours.toFixed(1)} öt)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(report.cost)}</TableCell>
                        <TableCell className="text-center">
                          {report.approved ? (
                            <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-amber-600 hover:text-green-600 hover:bg-green-50"
                              onClick={() => handleApprove([report.id], `${staff.staff_name} (${report.report_date})`)}
                              title="Klicka för att godkänna"
                            >
                              <Clock className="h-4 w-4 mr-1" />
                              <span className="text-xs">Väntar</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
                {/* Total row */}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={2}>TOTALT</TableCell>
                  <TableCell className="text-right">{summary.actualHours.toFixed(1)} h</TableCell>
                  <TableCell className="text-right">{formatCurrency(summary.staffActual)}</TableCell>
                  <TableCell className="text-center">
                    {allApproved && status === 'ok' ? (
                      <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                    ) : allApproved ? (
                      <div className="flex items-center justify-center gap-1">
                        <AlertTriangle className={cn("h-4 w-4", status === 'danger' ? 'text-destructive' : 'text-amber-600')} />
                        <span className={cn("text-xs", getDeviationColor(status))}>
                          {summary.staffDeviation > 0 ? '+' : ''}{(summary.actualHours - summary.budgetedHours).toFixed(1)} tim
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span className="text-xs text-amber-600">{pendingCount} väntar</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all",
                  status === 'ok' ? 'bg-green-500' : 
                  status === 'warning' ? 'bg-amber-500' : 'bg-destructive'
                )}
                style={{ width: `${Math.min(summary.staffDeviationPercent, 100)}%` }}
              />
            </div>
            <p className={cn("text-xs text-right mt-1", getDeviationColor(status))}>
              {summary.staffDeviationPercent.toFixed(1)}%
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Inga tidrapporter registrerade för detta projekt
          </p>
        )}
      </CardContent>
    </Card>
  );
};
