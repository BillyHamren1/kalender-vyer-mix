import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, PackageCheck } from 'lucide-react';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { OpsAssignedStaff, OpsJob, OpsRangeData } from '@/hooks/useWarehouseOpsRange';
import QuickAssignStaffPopover from '@/components/warehouse-ops/QuickAssignStaffPopover';

interface Props { data: OpsRangeData; }
interface WeekRow { key: string; date: string; job: OpsJob; assignedStaff: OpsAssignedStaff[]; }

const STATUS_LABELS: Record<string, string> = {
  planning: 'Ej påbörjad', in_progress: 'Packas', packed: 'Packad', delivered: 'Ute hos kund',
  back: 'Retur väntar', returning: 'Retur pågår', started_back: 'Retur pågår', in_production: 'Pågår',
  completed_out: 'Utlevererad', completed_in: 'Retur klar', completed: 'Klar', done: 'Klar',
};
const STATUS_DOT: Record<string, string> = {
  planning: 'bg-slate-400', in_progress: 'bg-amber-500', packed: 'bg-blue-500', delivered: 'bg-indigo-500',
  back: 'bg-orange-500', returning: 'bg-amber-500', started_back: 'bg-amber-500', in_production: 'bg-amber-500',
  completed_out: 'bg-emerald-500', completed_in: 'bg-emerald-500', completed: 'bg-emerald-500', done: 'bg-emerald-500',
};
const ACTIVE_STATUSES = new Set(['in_progress', 'returning', 'back', 'started_back', 'in_production']);

function formatClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function rowTime(row: WeekRow): string {
  const starts = row.assignedStaff.map((a) => formatClock(a.startTime)).filter((v): v is string => !!v).sort();
  const ends = row.assignedStaff.map((a) => formatClock(a.endTime)).filter((v): v is string => !!v).sort();
  if (starts.length > 0) {
    const start = starts[0];
    const end = ends.length > 0 ? ends[ends.length - 1] : null;
    return end && end !== start ? `${start}–${end}` : start;
  }
  return formatClock(row.job.anchorTime) || 'Sätt tid';
}

function staffLabel(row: WeekRow): { text: string; muted: boolean } {
  const planned = [...new Set(row.assignedStaff.map((a) => a.name).filter(Boolean))];
  if (planned.length > 0) return { text: planned.length <= 2 ? planned.join(', ') : `${planned.slice(0, 2).join(', ')} +${planned.length - 2}`, muted: false };
  const active = [...new Set(row.job.workers.map((w) => w.name).filter(Boolean))];
  if (active.length > 0) return { text: `Aktiv: ${active.length <= 2 ? active.join(', ') : `${active.slice(0, 2).join(', ')} +${active.length - 2}`}`, muted: false };
  return { text: '+ Bemanna', muted: true };
}

function workType(job: OpsJob): string {
  if (job.direction === 'in') return 'Retur';
  if (job.direction === 'internal') return 'Lager';
  return 'Packning';
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
      for (const [date, assignedStaff] of byDate.entries()) rows.push({ key: `${job.id}-${date}`, date, job, assignedStaff });
      continue;
    }
    if (job.anchorDate && job.anchorDate >= firstDay && job.anchorDate <= lastDay) {
      rows.push({ key: `${job.id}-${job.anchorDate}`, date: job.anchorDate, job, assignedStaff: [] });
      continue;
    }
    const lastDate = job.endDate || job.anchorDate;
    const alreadyRiggedDown = !!lastDate && lastDate < firstDay;
    if (ACTIVE_STATUSES.has(job.status) && !alreadyRiggedDown) rows.push({ key: `${job.id}-${firstDay}-active`, date: firstDay, job, assignedStaff: [] });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || rowTime(a).localeCompare(rowTime(b), 'sv', { numeric: true }));
}

const WarehouseOverviewNext7Days: React.FC<Props> = ({ data }) => {
  const navigate = useNavigate();
  const rows = useMemo(() => buildRows(data), [data]);
  const today = startOfDay(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const key = format(date, 'yyyy-MM-dd');
    return { date, key, rows: rows.filter((row) => row.date === key) };
  }), [rows, today]);

  return (
    <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div className="h-7 px-2.5 bg-muted/35 border-b border-border/60 grid grid-cols-[82px_84px_100px_minmax(170px,1fr)_minmax(150px,220px)_125px_18px] gap-2 items-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Tid</span><span>Typ</span><span>Bokning</span><span>Kund / jobb</span><span>Bemanning</span><span>Status</span><span />
      </div>
      {days.map(({ date, key, rows: dayRows }, dayIndex) => {
        const isToday = isSameDay(date, new Date());
        const unstaffed = dayRows.filter((r) => r.assignedStaff.length === 0 && r.job.workers.length === 0).length;
        return (
          <div key={key} className={cn(dayIndex > 0 && 'border-t border-border/60')}>
            <div className={cn('h-7 px-2.5 flex items-center gap-2 text-[11px]', isToday ? 'bg-warehouse/8' : 'bg-muted/15')}>
              <span className="font-bold uppercase tracking-wide text-[hsl(var(--heading))]">{format(date, 'EEE', { locale: sv })}</span>
              <span className="font-semibold text-muted-foreground">{format(date, 'd MMM', { locale: sv })}</span>
              <span className="text-muted-foreground">· {dayRows.length} jobb</span>
              {unstaffed > 0 && <span className="font-semibold text-orange-700">· {unstaffed} obemannade</span>}
              {isToday && <span className="ml-auto text-[9px] font-bold uppercase text-warehouse">Idag</span>}
            </div>

            {dayRows.length > 0 && (
              <div className="divide-y divide-border/35">
                {dayRows.map((row) => {
                  const staff = staffLabel(row);
                  const statusLabel = STATUS_LABELS[row.job.status] || row.job.status.replace(/_/g, ' ');
                  const title = row.job.bookingNumber || row.job.name;
                  const secondary = row.job.bookingNumber && row.job.name !== row.job.bookingNumber ? row.job.name : row.job.client;
                  const time = rowTime(row);
                  return (
                    <div
                      key={row.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/warehouse/packing/${row.job.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/warehouse/packing/${row.job.id}`); } }}
                      className="min-h-9 px-2.5 grid grid-cols-[82px_84px_100px_minmax(170px,1fr)_minmax(150px,220px)_125px_18px] gap-2 items-center hover:bg-accent/30 cursor-pointer text-xs"
                    >
                      <span className={cn('font-semibold tabular-nums', time === 'Sätt tid' && 'text-orange-700')}>{time}</span>
                      <span className="font-semibold text-muted-foreground">{workType(row.job)}</span>
                      <span className="font-mono font-bold truncate">{title}</span>
                      <span className="truncate text-foreground/85">{secondary || row.job.client || '—'}</span>
                      <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                        <QuickAssignStaffPopover packingId={row.job.id} packingName={row.job.bookingNumber || row.job.name} assignedNames={row.assignedStaff.map((a) => a.name).filter(Boolean)} label={staff.text} muted={staff.muted} />
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[row.job.status] || 'bg-slate-400')} />
                        <span className="truncate font-medium">{statusLabel}{row.job.totalItems > 0 && !['completed', 'done', 'completed_in', 'completed_out'].includes(row.job.status) ? ` · ${row.job.percent}%` : ''}</span>
                        {row.job.percent >= 100 && <PackageCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};

export default WarehouseOverviewNext7Days;
