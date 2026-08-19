import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  PackageCheck,
  Truck,
  Undo2,
  UserRound,
} from 'lucide-react';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { OpsAssignedStaff, OpsJob, OpsRangeData } from '@/hooks/useWarehouseOpsRange';

interface Props {
  data: OpsRangeData;
}

interface WeekRow {
  key: string;
  date: string;
  job: OpsJob;
  assignedStaff: OpsAssignedStaff[];
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Ej påbörjad',
  in_progress: 'Packas',
  packed: 'Packad',
  delivered: 'Ute hos kund',
  back: 'Retur väntar',
  returning: 'Retur pågår',
  started_back: 'Retur pågår',
  in_production: 'Pågår',
  completed_out: 'Utlevererad',
  completed_in: 'Retur klar',
  completed: 'Klar',
  done: 'Klar',
};

const STATUS_TONE: Record<string, string> = {
  planning: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  packed: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  back: 'bg-orange-50 text-orange-800 border-orange-200',
  returning: 'bg-amber-50 text-amber-800 border-amber-200',
  started_back: 'bg-amber-50 text-amber-800 border-amber-200',
  in_production: 'bg-amber-50 text-amber-800 border-amber-200',
  completed_out: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed_in: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const ACTIVE_STATUSES = new Set(['in_progress', 'returning', 'back', 'started_back', 'in_production']);

function formatClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function rowTime(row: WeekRow): string {
  const starts = row.assignedStaff
    .map((a) => formatClock(a.startTime))
    .filter((v): v is string => !!v)
    .sort();
  const ends = row.assignedStaff
    .map((a) => formatClock(a.endTime))
    .filter((v): v is string => !!v)
    .sort();

  if (starts.length > 0) {
    const start = starts[0];
    const end = ends.length > 0 ? ends[ends.length - 1] : null;
    return end && end !== start ? `${start}–${end}` : start;
  }

  return formatClock(row.job.anchorTime) || 'Tid ej satt';
}

function staffLabel(row: WeekRow): { text: string; muted: boolean } {
  const planned = [...new Set(row.assignedStaff.map((a) => a.name).filter(Boolean))];
  if (planned.length > 0) {
    return {
      text: planned.length <= 3 ? planned.join(', ') : `${planned.slice(0, 3).join(', ')} +${planned.length - 3}`,
      muted: false,
    };
  }

  const active = [...new Set(row.job.workers.map((w) => w.name).filter(Boolean))];
  if (active.length > 0) {
    return {
      text: `Aktiv: ${active.length <= 2 ? active.join(', ') : `${active.slice(0, 2).join(', ')} +${active.length - 2}`}`,
      muted: false,
    };
  }

  return { text: 'Ej bemannad', muted: true };
}

function buildRows(data: OpsRangeData): WeekRow[] {
  const today = startOfDay(new Date());
  const firstDay = format(today, 'yyyy-MM-dd');
  const lastDay = format(addDays(today, 6), 'yyyy-MM-dd');
  const rows: WeekRow[] = [];

  for (const job of data.jobs) {
    const byDate = new Map<string, OpsAssignedStaff[]>();

    for (const assignment of job.assignedStaff) {
      if (assignment.assignmentDate < firstDay || assignment.assignmentDate > lastDay) continue;
      const arr = byDate.get(assignment.assignmentDate) || [];
      arr.push(assignment);
      byDate.set(assignment.assignmentDate, arr);
    }

    if (byDate.size > 0) {
      for (const [date, assignedStaff] of byDate.entries()) {
        rows.push({ key: `${job.id}-${date}`, date, job, assignedStaff });
      }
      continue;
    }

    if (job.anchorDate && job.anchorDate >= firstDay && job.anchorDate <= lastDay) {
      rows.push({ key: `${job.id}-${job.anchorDate}`, date: job.anchorDate, job, assignedStaff: [] });
      continue;
    }

    // Ett aktivt jobb får aldrig försvinna ur arbetsveckan bara för att planeringen saknar dagens rad.
    if (ACTIVE_STATUSES.has(job.status)) {
      rows.push({ key: `${job.id}-${firstDay}-active`, date: firstDay, job, assignedStaff: [] });
    }
  }

  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return rowTime(a).localeCompare(rowTime(b), 'sv', { numeric: true });
  });
}

const WarehouseOverviewNext7Days: React.FC<Props> = ({ data }) => {
  const navigate = useNavigate();
  const rows = useMemo(() => buildRows(data), [data]);
  const today = startOfDay(new Date());

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i);
        const key = format(date, 'yyyy-MM-dd');
        return {
          date,
          key,
          rows: rows.filter((row) => row.date === key),
        };
      }),
    [rows, today],
  );

  return (
    <section className="mb-5">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Arbetsvecka</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Packningar dag för dag – när de ska göras, vem som är tilldelad och aktuell status.
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {days.map(({ date, key, rows: dayRows }, dayIndex) => {
          const isToday = isSameDay(date, new Date());
          return (
            <div key={key} className={cn(dayIndex > 0 && 'border-t border-border/60')}>
              <div className={cn('px-4 py-2.5 flex items-center gap-2', isToday ? 'bg-warehouse/5' : 'bg-muted/20')}>
                <div className="min-w-[125px]">
                  <span className="text-sm font-semibold text-[hsl(var(--heading))] capitalize">
                    {format(date, 'EEEE', { locale: sv })}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{format(date, 'd MMM', { locale: sv })}</span>
                </div>
                {isToday && (
                  <span className="rounded-full bg-warehouse/10 text-warehouse border border-warehouse/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                    Idag
                  </span>
                )}
              </div>

              {dayRows.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">Inget lagerarbete planerat.</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {dayRows.map((row) => {
                    const staff = staffLabel(row);
                    const statusLabel = STATUS_LABELS[row.job.status] || row.job.status.replaceAll('_', ' ');
                    const statusTone = STATUS_TONE[row.job.status] || 'bg-muted text-muted-foreground border-border';
                    const DirectionIcon = row.job.direction === 'in' ? Undo2 : Truck;
                    const directionLabel = row.job.direction === 'in' ? 'IN' : row.job.direction === 'internal' ? 'LAGER' : 'UT';
                    const title = row.job.bookingNumber || row.job.name;
                    const secondary = row.job.bookingNumber && row.job.name !== row.job.bookingNumber
                      ? row.job.name
                      : row.job.client;

                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => navigate(`/warehouse/packing/${row.job.id}`)}
                        className="w-full px-4 py-3 text-left hover:bg-accent/35 transition-colors grid gap-3 md:grid-cols-[110px_minmax(220px,1.5fr)_minmax(180px,1fr)_155px_28px] md:items-center"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--heading))]">
                            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                            {rowTime(row)}
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-muted-foreground">
                            <DirectionIcon className="h-3 w-3" />
                            {directionLabel}
                            {row.job.anchorTime && row.assignedStaff.length > 0 && (
                              <span>· deadline {formatClock(row.job.anchorTime)}</span>
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[hsl(var(--heading))] truncate">{title}</div>
                          {secondary && <div className="text-xs text-muted-foreground truncate mt-0.5">{secondary}</div>}
                        </div>

                        <div className="min-w-0">
                          <div className={cn('flex items-center gap-1.5 text-sm', staff.muted ? 'text-amber-700' : 'text-[hsl(var(--heading))]')}>
                            <UserRound className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{staff.text}</span>
                          </div>
                        </div>

                        <div className="flex md:justify-end items-center gap-2">
                          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap', statusTone)}>
                            {statusLabel}
                            {row.job.totalItems > 0 && !['completed', 'done', 'completed_in', 'completed_out'].includes(row.job.status)
                              ? ` · ${row.job.percent}%`
                              : ''}
                          </span>
                          {row.job.percent >= 100 && (
                            <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                          )}
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground justify-self-end hidden md:block" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default WarehouseOverviewNext7Days;
