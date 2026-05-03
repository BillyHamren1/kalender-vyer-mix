/**
 * PlannedStaffPanel — visar all personal som är planerad för en given dag,
 * vilka projekt de är planerade i, och belyser avvikelser:
 *   • Ej startat (planerad start har passerat utan timer/rapport)
 *   • Sen start
 *   • Inga rapporter alls trots planerade jobb
 *
 * Återanvänder samma data som AdminTimeReview (booking_staff_assignments
 * + bookings) men separat hämtning för att inte kollidera med StaffTimeReports.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Clock, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ReportedStaff {
  id: string;
  earliest_start: string | null; // HH:mm:ss
  has_open_report: boolean;
  reports_count: number;
}

interface PlannedStaffPanelProps {
  date: Date;
  reportedStaff: ReportedStaff[];
  onSelectStaff: (id: string, name: string) => void;
}

interface PlannedJob {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  role: string | null;
  startIso: string | null;
}

interface PlannedRow {
  staffId: string;
  staffName: string;
  color: string | null;
  jobs: PlannedJob[];
  earliestPlannedStart: Date | null;
  reported: ReportedStaff | undefined;
}

const LATE_TOLERANCE_MIN = 15;

export const PlannedStaffPanel: React.FC<PlannedStaffPanelProps> = ({
  date,
  reportedStaff,
  onSelectStaff,
}) => {
  const dateStr = format(date, 'yyyy-MM-dd');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['planned-staff-day', dateStr],
    refetchInterval: 60_000,
    queryFn: async (): Promise<PlannedRow[]> => {
      const { data: bsa, error: bsaErr } = await supabase
        .from('booking_staff_assignments')
        .select('staff_id, booking_id, role, assignment_date')
        .eq('assignment_date', dateStr);
      if (bsaErr) throw bsaErr;
      if (!bsa || bsa.length === 0) return [];

      const staffIds = [...new Set(bsa.map(r => r.staff_id))];
      const bookingIds = [...new Set(bsa.map(r => r.booking_id))];

      const [{ data: staff }, { data: bookings }] = await Promise.all([
        supabase
          .from('staff_members')
          .select('id, name, color')
          .in('id', staffIds),
        supabase
          .from('bookings')
          .select('id, booking_number, client, eventdate, rigdaydate, rigdowndate, event_start_time, rig_start_time, rigdown_start_time')
          .in('id', bookingIds),
      ]);

      const staffMap = new Map((staff || []).map(s => [s.id, s]));
      const bookingMap = new Map((bookings || []).map(b => [b.id, b as any]));

      const byStaff = new Map<string, PlannedRow>();
      for (const a of bsa) {
        const s = staffMap.get(a.staff_id);
        if (!s) continue;
        const b = bookingMap.get(a.booking_id);

        let startIso: string | null = null;
        if (b) {
          const cand = [
            b.rigdaydate === dateStr ? b.rig_start_time : null,
            b.eventdate === dateStr ? b.event_start_time : null,
            b.rigdowndate === dateStr ? b.rigdown_start_time : null,
          ].filter(Boolean);
          if (cand.length > 0) {
            const earliest = cand.sort()[0] as string;
            startIso = earliest;
          }
        }

        const job: PlannedJob = {
          bookingId: a.booking_id,
          bookingNumber: b?.booking_number ?? null,
          client: b?.client ?? 'Okänt projekt',
          role: a.role ?? null,
          startIso,
        };

        const existing = byStaff.get(a.staff_id);
        if (existing) {
          existing.jobs.push(job);
          if (startIso) {
            const t = new Date(startIso);
            if (!existing.earliestPlannedStart || t < existing.earliestPlannedStart) {
              existing.earliestPlannedStart = t;
            }
          }
        } else {
          byStaff.set(a.staff_id, {
            staffId: a.staff_id,
            staffName: s.name,
            color: s.color ?? null,
            jobs: [job],
            earliestPlannedStart: startIso ? new Date(startIso) : null,
            reported: undefined,
          });
        }
      }

      const reportedMap = new Map(reportedStaff.map(r => [r.id, r]));
      const rows = [...byStaff.values()].map(r => ({
        ...r,
        reported: reportedMap.get(r.staffId),
      }));

      rows.sort((a, b) => a.staffName.localeCompare(b.staffName, 'sv'));
      return rows;
    },
  });

  const enriched = useMemo(() => {
    const reportedMap = new Map(reportedStaff.map(r => [r.id, r]));
    return rows.map(r => ({ ...r, reported: reportedMap.get(r.staffId) }));
  }, [rows, reportedStaff]);

  const now = new Date();

  const getStatus = (r: PlannedRow): {
    kind: 'not_started' | 'late' | 'ongoing' | 'done' | 'pending';
    label: string;
    icon: React.ElementType;
    className: string;
  } => {
    const reported = r.reported;
    const planned = r.earliestPlannedStart;
    const passedPlanned = planned && now.getTime() > planned.getTime() + LATE_TOLERANCE_MIN * 60_000;

    if (!reported || reported.reports_count === 0) {
      if (passedPlanned) {
        const lateMin = Math.round((now.getTime() - planned!.getTime()) / 60_000);
        return {
          kind: 'not_started',
          label: `Ej startat · ${lateMin} min sen`,
          icon: AlertTriangle,
          className: 'bg-destructive/15 text-destructive border-destructive/40',
        };
      }
      return {
        kind: 'pending',
        label: planned ? `Planerad ${format(planned, 'HH:mm')}` : 'Planerad',
        icon: Clock,
        className: 'bg-muted text-muted-foreground border-border',
      };
    }

    // Has reports
    if (planned && reported.earliest_start) {
      const [hh, mm] = reported.earliest_start.split(':').map(Number);
      const actual = new Date(planned);
      actual.setHours(hh || 0, mm || 0, 0, 0);
      const lateMin = Math.round((actual.getTime() - planned.getTime()) / 60_000);
      if (lateMin > LATE_TOLERANCE_MIN) {
        return {
          kind: 'late',
          label: `Sen start · ${lateMin} min`,
          icon: AlertTriangle,
          className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40',
        };
      }
    }

    if (reported.has_open_report) {
      return {
        kind: 'ongoing',
        label: 'Pågår',
        icon: Clock,
        className: 'bg-primary/15 text-primary border-primary/40',
      };
    }

    return {
      kind: 'done',
      label: 'Rapporterat',
      icon: CheckCircle2,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
    };
  };

  const counts = useMemo(() => {
    const c = { total: enriched.length, notStarted: 0, late: 0, ongoing: 0, done: 0, pending: 0 };
    for (const r of enriched) {
      const k = getStatus(r).kind;
      c[k as keyof typeof c]++;
    }
    return c;
  }, [enriched]);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm mb-4">
        <Skeleton className="h-6 w-48 mb-3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (enriched.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Planerad personal</h3>
          <span className="text-xs text-muted-foreground">
            {counts.total} {counts.total === 1 ? 'person' : 'personer'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {counts.notStarted > 0 && (
            <span className="inline-flex items-center gap-1 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />
              {counts.notStarted} ej startat
            </span>
          )}
          {counts.late > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              {counts.late} sena
            </span>
          )}
          {counts.ongoing > 0 && (
            <span className="text-primary">{counts.ongoing} pågår</span>
          )}
          {counts.done > 0 && (
            <span className="text-emerald-700 dark:text-emerald-400">{counts.done} klara</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {enriched
          .sort((a, b) => {
            // Avvikelser först
            const order = { not_started: 0, late: 1, ongoing: 2, pending: 3, done: 4 };
            const sa = getStatus(a).kind;
            const sb = getStatus(b).kind;
            if (sa !== sb) return order[sa] - order[sb];
            return a.staffName.localeCompare(b.staffName, 'sv');
          })
          .map(r => {
            const status = getStatus(r);
            const Icon = status.icon;
            const highlight = status.kind === 'not_started';
            return (
              <button
                key={r.staffId}
                type="button"
                onClick={() => onSelectStaff(r.staffId, r.staffName)}
                className={cn(
                  'text-left rounded-lg border p-2.5 transition-colors hover:bg-muted/50',
                  highlight && 'ring-2 ring-destructive/40 animate-pulse-subtle',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                      {r.color && (
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                      )}
                      {r.staffName}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('text-[10px] px-1.5 py-0 h-5 shrink-0 gap-1', status.className)}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {status.label}
                  </Badge>
                </div>
                <div className="space-y-0.5">
                  {r.jobs.map((j, i) => (
                    <div key={`${j.bookingId}-${i}`} className="text-xs text-muted-foreground truncate">
                      {j.bookingNumber ? `${j.bookingNumber} · ` : ''}{j.client}
                      {j.role && <span className="text-muted-foreground/70"> · {j.role}</span>}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
};
