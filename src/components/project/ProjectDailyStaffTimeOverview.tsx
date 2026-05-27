/**
 * ProjectDailyStaffTimeOverview
 * ============================================================================
 * Visar dag-för-dag-status av personalen på ett projekt/large project:
 *   - vilka som var assignade (BSA)
 *   - vilka som rapporterat (staff_day_submissions)
 *   - vilka som har godkänd cost line (project_staff_time_cost_lines)
 *   - extra rapporterade (ej assignade men med godkänd kostnad)
 *
 * Pure rendering — all data byggs av useProjectDailyStaffTimeOverview /
 * buildProjectDailyStaffTimeOverview.
 */
import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronDown, ChevronRight, CalendarDays, AlertTriangle, CheckCircle2, Send, UserMinus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useProjectDailyStaffTimeOverview } from '@/hooks/useProjectDailyStaffTimeOverview';
import { statusLabel, type DailyStaffStatus } from '@/lib/projects/projectDailyStaffTimeOverview';

interface Props {
  largeProjectId?: string | null;
  bookingIds: string[];
}

const STATUS_TONE: Record<DailyStaffStatus, string> = {
  approved: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200',
  submitted: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200',
  missing: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200',
  extra_approved: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200',
  extra_submitted: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300',
};

const STATUS_ICON: Record<DailyStaffStatus, React.ComponentType<any>> = {
  approved: CheckCircle2,
  submitted: Send,
  missing: AlertTriangle,
  extra_approved: UserMinus,
  extra_submitted: UserMinus,
};

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};
const fmtSEK = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

export function ProjectDailyStaffTimeOverview({ largeProjectId, bookingIds }: Props) {
  const { days, isLoading, error } = useProjectDailyStaffTimeOverview({
    largeProjectId,
    bookingIds,
  });

  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const toggle = (d: string) => setOpenDates((s) => ({ ...s, [d]: !s[d] }));

  if (isLoading) {
    return (
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Personal per dag</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-4 text-sm text-destructive">
          Kunde inte ladda personalöversikt: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (days.length === 0) {
    return (
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Personal per dag
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            Ingen bemannad personal eller rapporterad tid hittades för projektet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Global summary
  const totals = days.reduce(
    (acc, d) => {
      acc.assigned += d.totals.assigned;
      acc.missing += d.totals.missing;
      acc.submitted += d.totals.submitted;
      acc.approved += d.totals.approved;
      acc.extra += d.totals.extra;
      acc.minutes += d.totals.approvedMinutes;
      acc.cost += d.totals.approvedCost;
      return acc;
    },
    { assigned: 0, missing: 0, submitted: 0, approved: 0, extra: 0, minutes: 0, cost: 0 },
  );

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Personal per dag
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <Badge variant="outline" className={cn(STATUS_TONE.approved, 'border')}>
              {totals.approved} godkända
            </Badge>
            <Badge variant="outline" className={cn(STATUS_TONE.submitted, 'border')}>
              {totals.submitted} inskickade
            </Badge>
            <Badge variant="outline" className={cn(STATUS_TONE.missing, 'border')}>
              {totals.missing} saknas
            </Badge>
            {totals.extra > 0 && (
              <Badge variant="outline" className={cn(STATUS_TONE.extra_approved, 'border')}>
                {totals.extra} extra
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-2">
              Totalt godkänt: <span className="font-semibold">{fmtMin(totals.minutes)}</span> · {fmtSEK(totals.cost)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {days.map((d) => {
          const isOpen = openDates[d.date] ?? d.totals.missing > 0;
          const dateLabel = format(parseISO(d.date), "EEE d MMM yyyy", { locale: sv });
          return (
            <div key={d.date} className="rounded-md border border-border/40 overflow-hidden">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted/30',
                  isOpen && 'bg-muted/20',
                )}
                onClick={() => toggle(d.date)}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="font-medium capitalize">{dateLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {d.rows.length} rader · {d.totals.assigned} assignade
                </span>
                <div className="ml-auto flex items-center gap-1 flex-wrap">
                  {d.totals.missing > 0 && (
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_TONE.missing, 'border')}>
                      {d.totals.missing} saknas
                    </Badge>
                  )}
                  {d.totals.submitted > 0 && (
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_TONE.submitted, 'border')}>
                      {d.totals.submitted} inskickade
                    </Badge>
                  )}
                  {d.totals.approved > 0 && (
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_TONE.approved, 'border')}>
                      {d.totals.approved} godkända
                    </Badge>
                  )}
                  {d.totals.extra > 0 && (
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_TONE.extra_approved, 'border')}>
                      {d.totals.extra} extra
                    </Badge>
                  )}
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {fmtMin(d.totals.approvedMinutes)}
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border/40 bg-background">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-muted-foreground bg-muted/20">
                        <th className="px-3 py-1.5 font-semibold">Personal</th>
                        <th className="px-3 py-1.5 font-semibold">Status</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Godkänt</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Kostnad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => {
                        const Icon = STATUS_ICON[r.status];
                        return (
                          <tr key={`${r.date}-${r.staff_id}`} className="border-t border-border/30 hover:bg-muted/10">
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{r.staff_name ?? r.staff_id}</span>
                                {!r.assigned && (
                                  <Badge variant="outline" className="text-[9px] border-amber-400/50 text-amber-700 dark:text-amber-300">
                                    ej i BSA
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <Badge variant="outline" className={cn('gap-1 border text-[10px]', STATUS_TONE[r.status])}>
                                <Icon className="h-3 w-3" />
                                {statusLabel(r.status)}
                              </Badge>
                              {r.submissionStatus && (
                                <span className="ml-1.5 text-[10px] text-muted-foreground">
                                  ({r.submissionStatus})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {r.approvedMinutes > 0 ? fmtMin(r.approvedMinutes) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {r.approvedCost > 0 ? fmtSEK(r.approvedCost) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default ProjectDailyStaffTimeOverview;
