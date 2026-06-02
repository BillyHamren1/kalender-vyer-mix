/**
 * ProjectDailyStaffTimeOverview
 * ============================================================================
 * Kompakt DAG-baserad personalöversikt för ett projekt / large project.
 *
 * Huvudvy:
 *   - En rad per dag med total tid, total kostnad, oattesterad tid/kost,
 *     attesterad tid/kost, antal personer, samt en diskret badge när
 *     dagen innehåller oattesterad tid.
 *   - Ingen full personallista direkt.
 *
 * Klick på en dag → expanderar och visar all personal den dagen:
 *   namn · start/slut · timmar · timpris · kostnad · status (Oattesterad/Godkänd)
 *   + varningsbadge om hourly_rate saknas.
 *
 * Pure rendering — all data byggs av useProjectDailyStaffTimeOverview /
 * buildProjectDailyStaffTimeOverview.
 */
import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ChevronDown,
  ChevronRight,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useProjectDailyStaffTimeOverview } from '@/hooks/useProjectDailyStaffTimeOverview';

interface Props {
  largeProjectId?: string | null;
  bookingIds: string[];
}

const fmtMin = (m: number) => {
  if (!m || m <= 0) return '0h';
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};
const fmtSEK = (v: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(v || 0);
const fmtClock = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '—';
  }
};

export function ProjectDailyStaffTimeOverview({ largeProjectId, bookingIds }: Props) {
  const { days, isLoading, error } = useProjectDailyStaffTimeOverview({
    largeProjectId,
    bookingIds,
  });

  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const toggle = (d: string) =>
    setOpenDates((s) => ({ ...s, [d]: !s[d] }));

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

  // Filtrera bort dagar utan både bemanning och registrerad tid.
  const visibleDays = days.filter(
    (d) => d.totals.totalMinutes > 0 || d.totals.assigned > 0 || d.totals.missing > 0,
  );

  if (visibleDays.length === 0) {
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

  // Global summary för header — använder reggad tid (oattesterad + attesterad)
  const totals = visibleDays.reduce(
    (acc, d) => {
      acc.totalMinutes += d.totals.totalMinutes;
      acc.totalCost += d.totals.totalCost;
      acc.approvedMinutes += d.totals.approvedMinutes;
      acc.approvedCost += d.totals.approvedCost;
      acc.unapprovedMinutes += d.totals.unapprovedMinutes;
      acc.unapprovedCost += d.totals.unapprovedCost;
      acc.missing += d.totals.missing;
      return acc;
    },
    {
      totalMinutes: 0,
      totalCost: 0,
      approvedMinutes: 0,
      approvedCost: 0,
      unapprovedMinutes: 0,
      unapprovedCost: 0,
      missing: 0,
    },
  );

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Personal per dag
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <span className="text-xs text-muted-foreground">
              Totalt registrerat:{' '}
              <span className="font-semibold text-foreground">
                {fmtMin(totals.totalMinutes)}
              </span>{' '}
              · {fmtSEK(totals.totalCost)}
            </span>
            {totals.unapprovedMinutes > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
              >
                Oattesterat: {fmtMin(totals.unapprovedMinutes)} ·{' '}
                {fmtSEK(totals.unapprovedCost)}
              </Badge>
            )}
            {totals.approvedMinutes > 0 && (
              <Badge
                variant="outline"
                className="border-green-300 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
              >
                Attesterat: {fmtMin(totals.approvedMinutes)} ·{' '}
                {fmtSEK(totals.approvedCost)}
              </Badge>
            )}
            {totals.missing > 0 && (
              <Badge
                variant="outline"
                className="border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
              >
                {totals.missing} saknas
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visibleDays.map((d) => {
          const isOpen = openDates[d.date] ?? false;
          const dateLabel = format(parseISO(d.date), 'EEE d MMM yyyy', { locale: sv });
          const dayHasUnapproved = d.totals.hasUnapproved;
          const dayHasMissing = d.totals.missing > 0;
          return (
            <div
              key={d.date}
              className={cn(
                'rounded-md border overflow-hidden transition',
                dayHasUnapproved
                  ? 'border-amber-200 dark:border-amber-900/40'
                  : 'border-border/40',
                isOpen && 'shadow-sm',
              )}
            >
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-muted/30',
                  isOpen && 'bg-muted/20',
                )}
                onClick={() => toggle(d.date)}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex flex-col min-w-[10rem]">
                  <span className="font-medium capitalize">{dateLabel}</span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {d.totals.staffCount} personer
                  </span>
                </div>

                <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-sm font-semibold tabular-nums">
                      {fmtMin(d.totals.totalMinutes)}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtSEK(d.totals.totalCost)}
                    </span>
                  </div>

                  {dayHasUnapproved && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                    >
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      {fmtMin(d.totals.unapprovedMinutes)} oattesterat
                    </Badge>
                  )}
                  {d.totals.approvedMinutes > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-green-300 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                      {fmtMin(d.totals.approvedMinutes)} attesterat
                    </Badge>
                  )}
                  {dayHasMissing && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
                    >
                      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                      {d.totals.missing} saknas
                    </Badge>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/40 bg-background">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-muted-foreground bg-muted/20">
                        <th className="px-3 py-1.5 font-semibold">Personal</th>
                        <th className="px-3 py-1.5 font-semibold">Start–Slut</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Timmar</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Timpris</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Kostnad</th>
                        <th className="px-3 py-1.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => {
                        const isApproved = r.approvalState === 'approved';
                        const hasReportedTime = r.totalMinutes > 0;
                        const missingRate =
                          hasReportedTime &&
                          (r.hourlyRate == null ||
                            r.hourlyRate <= 0 ||
                            r.rateSource === 'missing_rate');
                        return (
                          <tr
                            key={`${r.date}-${r.staff_id}`}
                            className="border-t border-border/30 hover:bg-muted/10"
                          >
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium">
                                  {r.staff_name ?? r.staff_id}
                                </span>
                                {!r.assigned && hasReportedTime && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] border-amber-400/50 text-amber-700 dark:text-amber-300"
                                  >
                                    ej i BSA
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                              {hasReportedTime
                                ? `${fmtClock(r.startAt)} – ${fmtClock(r.endAt)}`
                                : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {hasReportedTime ? fmtMin(r.totalMinutes) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {missingRate ? (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] border-amber-400/60 text-amber-700 dark:text-amber-300"
                                >
                                  saknas
                                </Badge>
                              ) : r.hourlyRate ? (
                                fmtSEK(r.hourlyRate)
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {hasReportedTime ? fmtSEK(r.totalCost) : '—'}
                            </td>
                            <td className="px-3 py-1.5">
                              {hasReportedTime ? (
                                isApproved ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] gap-1 border-green-300 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    Godkänd
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                  >
                                    <Clock className="h-3 w-3" />
                                    Oattesterad
                                  </Badge>
                                )
                              ) : r.assigned ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] gap-1 border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Saknas
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                              {r.submissionStatus && hasReportedTime && (
                                <span className="ml-1.5 text-[10px] text-muted-foreground">
                                  ({r.submissionStatus})
                                </span>
                              )}
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
