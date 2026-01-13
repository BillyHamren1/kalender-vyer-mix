import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Settings, CheckCircle, AlertTriangle } from 'lucide-react';
import type { StaffTimeReport, EconomySummary } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor } from '@/types/projectEconomy';

interface StaffCostTableProps {
  timeReports: StaffTimeReport[];
  summary: EconomySummary;
  onOpenBudgetSettings: () => void;
}

export const StaffCostTable = ({ timeReports, summary, onOpenBudgetSettings }: StaffCostTableProps) => {
  const status = getDeviationStatus(summary.staffDeviationPercent);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
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
                  <TableHead>Personal</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-right">Kostnad</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeReports.map((report) => (
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
                      <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>TOTALT</TableCell>
                  <TableCell className="text-right">{summary.actualHours.toFixed(1)} h</TableCell>
                  <TableCell className="text-right">{formatCurrency(summary.staffActual)}</TableCell>
                  <TableCell className="text-center">
                    {status === 'ok' ? (
                      <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <AlertTriangle className={`h-4 w-4 ${status === 'danger' ? 'text-red-600' : 'text-yellow-600'}`} />
                        <span className={`text-xs ${getDeviationColor(status)}`}>
                          {summary.staffDeviation > 0 ? '+' : ''}{(summary.actualHours - summary.budgetedHours).toFixed(1)} tim
                        </span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  status === 'ok' ? 'bg-green-500' : 
                  status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(summary.staffDeviationPercent, 100)}%` }}
              />
            </div>
            <p className={`text-xs text-right mt-1 ${getDeviationColor(status)}`}>
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
