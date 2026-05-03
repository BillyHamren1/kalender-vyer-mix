/**
 * PlannedStaffPanel — Gantt-vy: personalrader till vänster, tidslinje ovan,
 * projektblock placerade enligt planerad start/slut för dagen.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Clock, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ReportedStaff {
  id: string;
  earliest_start: string | null;
  has_open_report: boolean;
  reports_count: number;
}

interface PlannedStaffPanelProps {
  date: Date;
  reportedStaff: ReportedStaff[];
  onSelectStaff: (id: string, name: string) => void;
}

type Phase = 'rigg' | 'event' | 'nedrigg';

interface PlannedJob {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  role: string | null;
  phase: Phase | null;
  start: Date | null;
  end: Date | null;
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
const HOUR_PX = 56;
const LANE_H = 22;
const LANE_GAP = 2;
const ROW_PAD_Y = 4;
const NAME_COL = 168;

// Samma färgspråk som personalkalendern: rigg=amber, event=primary/blå, nedrigg=violet
const PHASE_STYLE: Record<Phase, { bg: string; border: string; text: string }> = {
  rigg:    { bg: 'bg-amber-500/85',  border: 'border-amber-700',  text: 'text-white' },
  event:   { bg: 'bg-primary/85',    border: 'border-primary',    text: 'text-primary-foreground' },
  nedrigg: { bg: 'bg-violet-500/85', border: 'border-violet-700', text: 'text-white' },
};

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Acceptera både "HH:mm[:ss]" och full ISO/timestamptz "YYYY-MM-DD HH:mm:ss+TZ"
  if (/^\d{2}:\d{2}/.test(value)) {
    const [hh, mm] = value.split(':').map(Number);
    const d = new Date();
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d;
  }
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
        supabase.from('staff_members').select('id, name, color').in('id', staffIds),
        supabase
          .from('bookings')
          .select('id, booking_number, client, eventdate, rigdaydate, rigdowndate, event_start_time, event_end_time, rig_start_time, rig_end_time, rigdown_start_time, rigdown_end_time')
          .in('id', bookingIds),
      ]);

      const staffMap = new Map((staff || []).map(s => [s.id, s]));
      const bookingMap = new Map((bookings || []).map(b => [b.id, b as any]));

      const byStaff = new Map<string, PlannedRow>();
      for (const a of bsa) {
        const s = staffMap.get(a.staff_id);
        if (!s) continue;
        const b = bookingMap.get(a.booking_id);

        let phase: Phase | null = null;
        let start: Date | null = null;
        let end: Date | null = null;
        if (b) {
          if (b.rigdaydate === dateStr) {
            phase = 'rigg';
            start = parseTime(b.rig_start_time);
            end = parseTime(b.rig_end_time);
          } else if (b.eventdate === dateStr) {
            phase = 'event';
            start = parseTime(b.event_start_time);
            end = parseTime(b.event_end_time);
          } else if (b.rigdowndate === dateStr) {
            phase = 'nedrigg';
            start = parseTime(b.rigdown_start_time);
            end = parseTime(b.rigdown_end_time);
          }
          if (start && !end) end = new Date(start.getTime() + 60 * 60_000);
        }

        const job: PlannedJob = {
          bookingId: a.booking_id,
          bookingNumber: b?.booking_number ?? null,
          client: b?.client ?? 'Okänt projekt',
          role: a.role ?? null,
          phase,
          start,
          end,
        };

        const existing = byStaff.get(a.staff_id);
        if (existing) {
          existing.jobs.push(job);
          if (start && (!existing.earliestPlannedStart || start < existing.earliestPlannedStart)) {
            existing.earliestPlannedStart = start;
          }
        } else {
          byStaff.set(a.staff_id, {
            staffId: a.staff_id,
            staffName: s.name,
            color: s.color ?? null,
            jobs: [job],
            earliestPlannedStart: start,
            reported: undefined,
          });
        }
      }

      return [...byStaff.values()].sort((a, b) => a.staffName.localeCompare(b.staffName, 'sv'));
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
      return { kind: 'ongoing', label: 'Pågår', icon: Clock, className: 'bg-primary/15 text-primary border-primary/40' };
    }
    return { kind: 'done', label: 'Rapporterat', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40' };
  };

  // Tidsfönster för dagen
  const { startHour, endHour } = useMemo(() => {
    let minH = 8;
    let maxH = 18;
    for (const r of enriched) {
      for (const j of r.jobs) {
        if (j.start) minH = Math.min(minH, j.start.getHours());
        if (j.end) maxH = Math.max(maxH, j.end.getHours() + (j.end.getMinutes() > 0 ? 1 : 0));
      }
    }
    return { startHour: Math.max(0, minH), endHour: Math.min(24, Math.max(maxH, minH + 4)) };
  }, [enriched]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const trackWidth = (endHour - startHour) * HOUR_PX;

  const toX = (d: Date) => {
    const mins = (d.getHours() - startHour) * 60 + d.getMinutes();
    return (mins / 60) * HOUR_PX;
  };

  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const nowX = isToday && now.getHours() >= startHour && now.getHours() <= endHour ? toX(now) : null;

  const counts = useMemo(() => {
    const c = { total: enriched.length, notStarted: 0, late: 0, ongoing: 0, done: 0, pending: 0 };
    for (const r of enriched) c[getStatus(r).kind as keyof typeof c]++;
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

  const sorted = [...enriched].sort((a, b) => {
    const order = { not_started: 0, late: 1, ongoing: 2, pending: 3, done: 4 };
    const sa = getStatus(a).kind;
    const sb = getStatus(b).kind;
    if (sa !== sb) return order[sa] - order[sb];
    return a.staffName.localeCompare(b.staffName, 'sv');
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm mb-4">
      <div className="flex items-center justify-between p-3 border-b flex-wrap gap-2">
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
          {counts.late > 0 && <span className="text-amber-600 dark:text-amber-400">{counts.late} sena</span>}
          {counts.ongoing > 0 && <span className="text-primary">{counts.ongoing} pågår</span>}
          {counts.done > 0 && <span className="text-emerald-700 dark:text-emerald-400">{counts.done} klara</span>}
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: NAME_COL + trackWidth + 120 }}>
            {/* Header: timmar */}
            <div className="flex border-b sticky top-0 bg-card z-10">
              <div style={{ width: NAME_COL }} className="shrink-0 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Personal
              </div>
              <div className="relative" style={{ width: trackWidth, height: 28 }}>
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/60 text-[10px] text-muted-foreground pl-1"
                    style={{ left: (h - startHour) * HOUR_PX, width: HOUR_PX }}
                  >
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>
              <div className="shrink-0 w-[120px] px-2 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Status
              </div>
            </div>

            {/* Rader */}
            {sorted.map(r => {
              const status = getStatus(r);
              const Icon = status.icon;
              const highlight = status.kind === 'not_started';
              const noTimeJobs = r.jobs.filter(j => !j.start || !j.end);
              const timedJobs = [...r.jobs.filter(j => j.start && j.end)]
                .sort((a, b) => a.start!.getTime() - b.start!.getTime());

              // Lane-stacking: lägg jobb i första lane där det inte krockar
              const laneEnds: number[] = [];
              const placed = timedJobs.map(j => {
                const startMs = j.start!.getTime();
                const endMs = j.end!.getTime();
                let lane = laneEnds.findIndex(e => e <= startMs);
                if (lane === -1) {
                  lane = laneEnds.length;
                  laneEnds.push(endMs);
                } else {
                  laneEnds[lane] = endMs;
                }
                return { job: j, lane };
              });
              const laneCount = Math.max(1, laneEnds.length);
              const trackHeight = ROW_PAD_Y * 2 + laneCount * LANE_H + (laneCount - 1) * LANE_GAP;

              return (
                <div
                  key={r.staffId}
                  className={cn(
                    'flex items-stretch border-b last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors',
                    highlight && 'bg-destructive/5',
                  )}
                  onClick={() => onSelectStaff(r.staffId, r.staffName)}
                >
                  <div style={{ width: NAME_COL }} className="shrink-0 px-3 py-2 flex items-center gap-2 min-w-0">
                    {r.color && (
                      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    )}
                    <span className="text-sm font-medium truncate">{r.staffName}</span>
                  </div>

                  <div
                    className="relative border-l"
                    style={{
                      width: trackWidth,
                      height: trackHeight,
                      backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${HOUR_PX - 1}px, hsl(var(--border)/0.5) ${HOUR_PX - 1}px, hsl(var(--border)/0.5) ${HOUR_PX}px)`,
                    }}
                  >
                    {nowX !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-destructive/70 z-20 pointer-events-none"
                        style={{ left: nowX }}
                      />
                    )}
                    {placed.map(({ job: j, lane }, i) => {
                      const left = toX(j.start!);
                      const width = Math.max(36, toX(j.end!) - left);
                      const top = ROW_PAD_Y + lane * (LANE_H + LANE_GAP);
                      const style = j.phase ? PHASE_STYLE[j.phase] : { bg: 'bg-muted', border: 'border-border', text: 'text-foreground' };
                      return (
                        <Tooltip key={`${j.bookingId}-${i}`}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'absolute rounded-sm border px-1.5 text-[11px] leading-none flex items-center overflow-hidden shadow-sm',
                                style.bg, style.border, style.text,
                              )}
                              style={{ left, width, top, height: LANE_H }}
                            >
                              <span className="truncate font-medium">
                                {format(j.start!, 'HH:mm')} {j.bookingNumber ?? j.client}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="font-semibold">{j.bookingNumber ? `${j.bookingNumber} · ` : ''}{j.client}</div>
                            <div>{format(j.start!, 'HH:mm')}–{format(j.end!, 'HH:mm')} {j.phase ? `· ${j.phase}` : ''}</div>
                            {j.role && <div className="text-muted-foreground">{j.role}</div>}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    {noTimeJobs.length > 0 && (
                      <div className="absolute right-1 top-1 flex items-center">
                        <Badge variant="outline" className="text-[10px] h-5">
                          {noTimeJobs.length} utan tid
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 w-[120px] px-2 py-2 flex items-center justify-end">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5 gap-1', status.className)}>
                      <Icon className="h-2.5 w-2.5" />
                      {status.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
};
