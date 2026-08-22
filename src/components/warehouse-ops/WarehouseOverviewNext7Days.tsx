import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ChevronRight, Clock3, PackageCheck, UsersRound } from 'lucide-react';
import { addDays, format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { OpsAssignedStaff, OpsJob, OpsRangeData } from '@/hooks/useWarehouseOpsRange';
import QuickAssignStaffPopover from '@/components/warehouse-ops/QuickAssignStaffPopover';

interface Props {
  data: OpsRangeData;
  selectedJobId?: string | null;
  onSelectJob?: (job: OpsJob) => void;
}
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
  const rangeStart = startOfDay(parseISO(data.rangeStart));
  const firstDay = format(rangeStart, 'yyyy-MM-dd');
  const lastDay = format(addDays(rangeStart, 6), 'yyyy-MM-dd');
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

const WarehouseOverviewNext7Days: React.FC<Props> = ({ data, selectedJobId, onSelectJob }) => {
  const navigate = useNavigate();
  const rows = useMemo(() => buildRows(data), [data]);
  const rangeStart = useMemo(() => startOfDay(parseISO(data.rangeStart)), [data.rangeStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(rangeStart, i);
    const key = format(date, 'yyyy-MM-dd');
    return { date, key, rows: rows.filter((row) => row.date === key) };
  }), [rows, rangeStart]);

  return (
    <section className="h-full min-h-0 rounded-lg border border-border/60 bg-card overflow-hidden flex flex-col">
      <header className="h-10 shrink-0 px-3 border-b border-border/60 flex items-center gap-2">
        <h2 className="text-sm font-bold text-[hsl(var(--heading))]">Arbetsvecka</h2>
        <span className="text-[10px] text-muted-foreground">Klicka ett jobb för snabböversikt</span>
        <div className="ml-auto hidden 2xl:flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><UsersRound className="h-3 w-3" /> Personal</span>
          <span className="inline-flex items-center gap-1"><Box className="h-3 w-3" /> Packning</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Klar</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Pågår</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="h-full min-w-[980px] grid grid-cols-7 divide-x divide-border/55">
          {days.map(({ date, key, rows: dayRows }) => {
            const isToday = isSameDay(date, new Date());
            const unstaffed = dayRows.filter((r) => r.assignedStaff.length === 0 && r.job.workers.length === 0).length;
            return (
              <div key={key} className={cn("min-w-0 flex flex-col", isToday && "bg-warehouse/[0.025]")}>
                <div className={cn(
                  "h-11 shrink-0 px-2.5 border-b border-border/55 flex items-center gap-2 sticky top-0 z-10",
                  isToday ? "bg-warehouse/10" : "bg-muted/25",
                )}>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[hsl(var(--heading))]">
                      {format(date, "EEE d", { locale: sv })}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{dayRows.length} jobb{unstaffed > 0 ? ` · ${unstaffed} obem.` : ""}</div>
                  </div>
                  {isToday && <span className="ml-auto rounded bg-warehouse px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">Idag</span>}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {dayRows.length === 0 ? (
                    <div className="h-14 rounded border border-dashed border-border/55 flex items-center justify-center text-[10px] text-muted-foreground">
                      Inget planerat
                    </div>
                  ) : dayRows.map((row) => {
                    const staff = staffLabel(row);
                    const statusLabel = STATUS_LABELS[row.job.status] || row.job.status.replace(/_/g, " ");
                    const title = row.job.bookingNumber || row.job.name;
                    const secondary = row.job.bookingNumber && row.job.name !== row.job.bookingNumber ? row.job.name : row.job.client;
                    const time = rowTime(row);
                    const selected = selectedJobId === row.job.id;
                    return (
                      <article
                        key={row.key}
                        className={cn(
                          "rounded-md border-l-4 border-y border-r bg-background px-2 py-1.5 cursor-pointer transition-colors hover:border-warehouse/45 hover:bg-accent/20",
                          selected ? "border-warehouse ring-1 ring-warehouse/25" : "border-border/60",
                          row.job.direction === 'in' && !selected && "border-l-red-500 bg-red-50/40",
                          row.job.direction === 'out' && !selected && "border-l-green-500 bg-green-50/40",
                          row.job.direction === 'in' && selected && "border-l-red-500",
                          row.job.direction === 'out' && selected && "border-l-green-500",
                        )}
                        onClick={() => onSelectJob?.(row.job)}
                      >
                        <div className="flex items-center gap-1.5">
                          <Clock3 className={cn("h-3 w-3 shrink-0", time === "Sätt tid" ? "text-orange-600" : "text-muted-foreground")} />
                          <span className={cn("text-[10px] font-bold tabular-nums", time === "Sätt tid" && "text-orange-700")}>{time}</span>
                          <span className={cn(
                            "ml-auto text-[9px] font-semibold",
                            row.job.direction === 'in' ? "text-red-700" : row.job.direction === 'out' ? "text-green-700" : "text-muted-foreground"
                          )}>{workType(row.job)}</span>
                        </div>
                        <div className="mt-1 text-[11px] font-bold truncate">{title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{secondary || row.job.client || "—"}</div>
                        <div className="mt-1.5 flex items-center gap-1 min-w-0">
                          <span className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[row.job.status] || "bg-slate-400")} />
                          <span className="text-[9px] font-semibold truncate">
                            {statusLabel}{row.job.totalItems > 0 && !["completed", "done", "completed_in", "completed_out"].includes(row.job.status) ? ` · ${row.job.percent}%` : ""}
                          </span>
                          {row.job.percent >= 100 && <PackageCheck className="h-3 w-3 text-emerald-600 shrink-0" />}
                          <button
                            type="button"
                            title="Öppna packning"
                            className="ml-auto h-5 w-5 rounded flex items-center justify-center hover:bg-accent shrink-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/warehouse/packing/${row.job.packingId}`);
                            }}
                          >
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                        <div className="mt-0.5 min-w-0" onClick={(event) => event.stopPropagation()}>
                          <QuickAssignStaffPopover
                            packingId={row.job.packingId}
                            packingName={title}
                            assignedNames={row.assignedStaff.map((a) => a.name).filter(Boolean)}
                            label={staff.text}
                            muted={staff.muted}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default WarehouseOverviewNext7Days;
