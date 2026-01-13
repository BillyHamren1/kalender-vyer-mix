import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { ProjectStaffSummary } from '@/types/projectStaff';

interface StaffSummaryCardProps {
  summary: ProjectStaffSummary;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const StaffSummaryCard = ({ summary }: StaffSummaryCardProps) => {
  const totalHours = summary.reportedHours + summary.manualHours;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Sammanfattning
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Planerad personal</p>
            <p className="text-2xl font-semibold">{summary.plannedStaffCount}</p>
            <p className="text-xs text-muted-foreground">personer</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Arbetsdagar</p>
            <p className="text-2xl font-semibold">{summary.workDays}</p>
            <p className="text-xs text-muted-foreground">dagar</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Rapporterad tid</p>
            <p className="text-2xl font-semibold">{summary.reportedHours}</p>
            <p className="text-xs text-muted-foreground">
              timmar {summary.reportedOvertimeHours > 0 && `(+ ${summary.reportedOvertimeHours} h övertid)`}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Manuella kostnader</p>
            <p className="text-2xl font-semibold">{formatCurrency(summary.totalLaborCost)}</p>
            <p className="text-xs text-muted-foreground">{summary.manualHours} timmar</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
