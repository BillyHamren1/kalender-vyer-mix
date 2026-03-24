import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffTimeReport, DetailedTimeReport } from '@/types/projectEconomy';
import { useApproveTimeReport } from '@/hooks/useApproveTimeReport';
import { formatHoursMinutes } from '@/utils/formatHours';

interface TimeApprovalSummaryProps {
  timeReports: StaffTimeReport[];
  className?: string;
}

export const TimeApprovalSummary: React.FC<TimeApprovalSummaryProps> = ({ timeReports, className }) => {
  const { approveMutation } = useApproveTimeReport();

  const allDetailed = timeReports.flatMap(r => r.detailed_reports || []);
  const pending = allDetailed.filter(r => !r.approved);
  const approved = allDetailed.filter(r => r.approved);
  const totalHours = timeReports.reduce((s, r) => s + r.total_hours, 0);
  const totalCost = timeReports.reduce((s, r) => s + r.total_cost, 0);

  const handleApproveAll = () => {
    if (pending.length === 0) return;
    approveMutation.mutate(pending.map(r => r.id));
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

  if (allDetailed.length === 0) {
    return (
      <Card className={cn('border-border/40', className)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" />
            Inga tidrapporter registrerade
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-border/40', className)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tidrapporter
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatHoursMinutes(totalHours)} · {formatCurrency(totalCost)}
            </span>
            {pending.length === 0 ? (
              <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                Alla godkända
              </span>
            ) : (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                {pending.length} väntar
              </span>
            )}
          </div>
        </div>

        {/* Per-staff summary */}
        <div className="space-y-1.5">
          {timeReports.map(staff => {
            const staffPending = (staff.detailed_reports || []).filter(r => !r.approved);
            const staffApproved = (staff.detailed_reports || []).filter(r => r.approved);
            return (
              <div
                key={staff.staff_id}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md border text-xs',
                  staffPending.length === 0
                    ? 'border-green-200/60 bg-green-50/50 dark:border-green-800/40 dark:bg-green-950/10'
                    : 'border-amber-200/60 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/10'
                )}
              >
                <div className="shrink-0">
                  {staffPending.length === 0 ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{staff.staff_name}</p>
                  <p className="text-muted-foreground">
                    {formatHoursMinutes(staff.total_hours)} · {staffApproved.length} godkända
                    {staffPending.length > 0 && `, ${staffPending.length} väntar`}
                  </p>
                </div>
                <span className="text-xs font-medium text-foreground shrink-0">
                  {formatCurrency(staff.total_cost)}
                </span>
                {staffPending.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] shrink-0"
                    onClick={() => approveMutation.mutate(staffPending.map(r => r.id))}
                    disabled={approveMutation.isPending}
                  >
                    Godkänn
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Approve all button */}
        {pending.length > 0 && (
          <Button
            size="sm"
            variant="default"
            className="w-full gap-1.5 text-xs"
            onClick={handleApproveAll}
            disabled={approveMutation.isPending}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Godkänn alla ({pending.length} rapporter)
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
