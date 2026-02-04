import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Settings, CheckCircle, AlertTriangle, Clock, Check } from 'lucide-react';
import type { StaffTimeReport, EconomySummary } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor } from '@/types/projectEconomy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface StaffCostTableProps {
  timeReports: StaffTimeReport[];
  summary: EconomySummary;
  onOpenBudgetSettings: () => void;
}

export const StaffCostTable = ({ timeReports, summary, onOpenBudgetSettings }: StaffCostTableProps) => {
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

  const handleApprove = async (reportId: string, staffName: string) => {
    try {
      const { error } = await supabase
        .from('time_reports')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: 'Projektledare'
        })
        .eq('id', reportId);

      if (error) throw error;
      
      toast.success(`Tidrapport för ${staffName} godkänd`);
      queryClient.invalidateQueries({ queryKey: ['project-economy'] });
      queryClient.invalidateQueries({ queryKey: ['pending-time-reports'] });
    } catch (error) {
      console.error('Error approving time report:', error);
      toast.error('Kunde inte godkänna tidrapporten');
    }
  };

  // Check how many reports are pending
  const pendingCount = timeReports.filter(r => !(r as any).approved).length;
  const allApproved = pendingCount === 0;

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
                  <TableHead>Personal</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-right">Kostnad</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeReports.map((report) => {
                  const isApproved = (report as any).approved === true;
                  
                  return (
                    <TableRow key={report.staff_id}>
                      <TableCell className="font-medium">{report.staff_name}</TableCell>
                      <TableCell className="text-right">
                        {report.total_hours.toFixed(1)} h
                        {report.overtime_hours > 0 && (
                          <span className="text-muted-foreground text-xs ml-1">
                            (+{report.overtime_hours.toFixed(1)} öt)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(report.total_cost)}</TableCell>
                      <TableCell className="text-center">
                        {isApproved ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-amber-600 hover:text-green-600 hover:bg-green-50"
                            onClick={() => handleApprove(report.staff_id, report.staff_name)}
                            title="Klicka för att godkänna"
                          >
                            <Clock className="h-4 w-4 mr-1" />
                            <span className="text-xs">Väntar</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold border-t-2">
                  <TableCell>TOTALT</TableCell>
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
