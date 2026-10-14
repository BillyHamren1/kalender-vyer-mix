/**
 * Warehouse personnel matrix.
 *
 * Rows are actual people and columns are weekdays. Empty cells are rendered
 * explicitly as "Inga lagerjobb" so a manager can see both assignments and
 * gaps without inferring anything from legacy lager-N teams.
 */
import React, { useMemo, useState } from 'react';
import WarehouseJobSheet from '@/components/warehouse/WarehouseJobSheet';
import { Button } from '@/components/ui/button';
import { clockMinutes, planningSummary, conflictingJobs, timelineLanes } from '@/lib/warehouse/personnelPlanning';
import { eachDayOfInterval, endOfWeek, format, startOfDay, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, Clock3, MapPin, UserRound, UsersRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import QuickAssignStaffPopover from '@/components/warehouse-ops/QuickAssignStaffPopover';
import { useWarehousePersonnelWeek, type PersonnelJob } from '@/hooks/useWarehousePersonnelWeek';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getEventBgClass, getEventDotClass } from '@/components/Calendar/ResourceData';

const ACTIVITY_LABELS: Record<string, string> = {
  packing: 'Packning',
  return: 'Retur',
  delivery: 'Utleverans',
  unpacking: 'Uppackning',
  inventory: 'Inventering',
  internal_task: 'Lageruppgift',
  other: 'Lagerjobb',
};

interface Props {
  currentDate: Date;
  viewMode: 'day' | 'weekly';
}

const DAY_START_MINUTES = 0;
const DAY_END_MINUTES = 24 * 60;
const HOUR_HEIGHT = 56;
const TIMELINE_HEIGHT = ((DAY_END_MINUTES - DAY_START_MINUTES) / 60) * HOUR_HEIGHT;

const timelinePosition = (job: PersonnelJob): React.CSSProperties | null => {
  const rawStart = clockMinutes(job.startTime);
  if (rawStart === null) return null;
  const rawEnd = clockMinutes(job.endTime) ?? rawStart + 60;
  const start = Math.max(DAY_START_MINUTES, Math.min(rawStart, DAY_END_MINUTES - 15));
  const end = Math.max(start + 15, Math.min(rawEnd, DAY_END_MINUTES));
  return {
    top: ((start - DAY_START_MINUTES) / 60) * HOUR_HEIGHT + 4,
    height: Math.max(24, ((end - start) / 60) * HOUR_HEIGHT - 8),
  };
};

const JobCard: React.FC<{
  job: PersonnelJob;
  onOpen: (job: PersonnelJob) => void;
  unstaffed?: boolean;
  compact?: boolean;
  conflict?: boolean;
}> = ({ job, onOpen, unstaffed = false, compact = false, conflict = false }) => (
  <div className={`overflow-hidden rounded-md border border-border/60 p-1.5 shadow-sm ${getEventBgClass(job.activityType)}`}>
    <button type="button" onClick={() => onOpen(job)} className="block w-full text-left">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--heading))]">
        <span className={`h-2 w-2 rounded-full shrink-0 ${getEventDotClass(job.activityType)}`} />
        <span className="truncate">{ACTIVITY_LABELS[job.activityType] || ACTIVITY_LABELS.other}</span>
        {job.bookingNumber && <span className="ml-auto tabular-nums truncate">{job.bookingNumber}</span>}
      </div>
      <div className="mt-1 text-sm font-medium line-clamp-2">{job.customerName || job.title}</div>
      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock3 className="h-3 w-3 shrink-0" />
        <span>
          {job.startTime || 'Tid saknas'}
          {job.endTime ? `–${job.endTime}` : ''}
        </span>
      </div>
      {conflict && <p className="mt-1 text-xs font-semibold text-amber-800">Tidskonflikt</p>}
      {!compact && job.deliveryAddress && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{job.deliveryAddress}</span>
        </div>
      )}
    </button>
    {unstaffed && job.warehouseEventId && (
      <div className="mt-1 border-t border-border/40 pt-1">
        <QuickAssignStaffPopover
          warehouseEventId={job.warehouseEventId}
          packingName={job.bookingNumber || job.title}
          assignedNames={[]}
          label="Bemanna jobbet"
          muted
        />
      </div>
    )}
  </div>
);

const DayColumn: React.FC<{
  jobs: PersonnelJob[];
  onOpen: (job: PersonnelJob) => void;
  unstaffed?: boolean;
}> = ({ jobs, onOpen, unstaffed = false }) => {
  const untimed = jobs.filter((job) => timelinePosition(job) === null);
  const timed = jobs.filter((job) => timelinePosition(job) !== null);
  const conflicts = conflictingJobs(jobs);
  const layout = timelineLanes(timed.map(job => ({ job, top: Number(timelinePosition(job)!.top), height: Number(timelinePosition(job)!.height) })));

  return (
    <div className={`border-r border-border/60 ${unstaffed ? 'bg-amber-50/20' : 'bg-background'}`}>
      <div className="h-[76px] space-y-1 overflow-y-auto border-b border-border/60 p-1.5">
        {untimed.length === 0 ? (
          <span className="block pt-5 text-center text-xs text-muted-foreground">Inget utan tid</span>
        ) : (
          untimed.map((job) => (
            <JobCard
              key={`${job.assignmentId || job.warehouseEventId || job.title}-${job.date}`}
              job={job}
              onOpen={onOpen}
              unstaffed={unstaffed}
              compact
            />
          ))
        )}
      </div>
      <div
        className="relative"
        style={{
          height: TIMELINE_HEIGHT,
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 55px, hsl(var(--border) / 0.55) 55px, hsl(var(--border) / 0.55) 56px)',
        }}
      >
        {layout.items.map(({ job, top, height, lane }) => (
          <div key={`${job.assignmentId || job.warehouseEventId || job.title}-${job.date}`}
            className="absolute z-10 px-1"
            style={{ top, height, left: `${lane / layout.laneCount * 100}%`, width: `${100 / layout.laneCount}%` }}>
            <button type="button" onClick={() => onOpen(job)}
              title={`${job.title} · ${job.startTime}–${job.endTime}${conflicts.has(job) ? ' · Tidskonflikt' : ''}`}
              aria-label={`${job.title} ${job.startTime}–${job.endTime}${conflicts.has(job) ? ' Tidskonflikt' : ''}`}
              className={`h-full w-full overflow-hidden rounded border p-1 text-left text-xs shadow-sm ${getEventBgClass(job.activityType)} ${conflicts.has(job) ? 'border-amber-600' : 'border-border/60'}`}>
              <span className="block font-semibold truncate">{job.title}</span>
              <span className="block tabular-nums">{job.startTime}–{job.endTime}</span>
              {conflicts.has(job) && <span className="block font-semibold">Tidskonflikt</span>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const WarehousePersonnelView: React.FC<Props> = ({ currentDate, viewMode }) => {
  const [selectedJob, setSelectedJob] = useState<PersonnelJob | null>(null);
  const [layout, setLayout] = useState<'list' | 'timeline'>('list');
  const [staffFilter, setStaffFilter] = useState('all');
  const rangeStart = useMemo(
    () => viewMode === 'day' ? startOfDay(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate, viewMode],
  );
  const rangeEnd = useMemo(
    () => viewMode === 'day' ? startOfDay(currentDate) : endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate, viewMode],
  );
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeEnd, rangeStart],
  );
  const { data, isLoading, isError, refetch } = useWarehousePersonnelWeek(rangeStart, rangeEnd);

  const openJob = (job: PersonnelJob) => setSelectedJob(job);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 rounded-lg" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) return <div role="alert" className="rounded-lg border p-6 space-y-3"><p>Kunde inte läsa lagerplaneringen. Försök igen för att se aktuell bemanning.</p><Button onClick={() => void refetch()}>Försök igen</Button></div>;
  const rows = data?.rows ?? [];
  const unstaffed = data?.unstaffed ?? [];
  const visibleRows = staffFilter === 'all' ? rows : rows.filter((row) => row.staffId === staffFilter);
  const totalJobs = rows.reduce((sum, row) => sum + row.jobs.length, 0);

  const jobsForDay = (jobs: PersonnelJob[], day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    return jobs.filter((job) => job.date === key);
  };

  const columnWidth = Math.max(240, ...[unstaffed, ...visibleRows.map(row => row.jobs)].map(jobs => timelineLanes(jobs.filter(job => timelinePosition(job)).map(job => ({job, top: Number(timelinePosition(job)!.top), height: Number(timelinePosition(job)!.height)}))).laneCount * 200));
  return (
    <div className="min-h-0 flex-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-warehouse" />
          <span className="text-sm font-semibold">
            {viewMode === 'day'
              ? `Lagerpersonal · ${format(currentDate, 'EEEE d MMMM', { locale: sv })}`
              : 'Personalens lagervecka'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} personer · {totalJobs} tilldelningar · {unstaffed.length} obemannade
        </span>
        <div className="flex gap-1" aria-label="Visning av personalplanering">
          <Button size="sm" variant={layout === 'list' ? 'default' : 'outline'} onClick={() => setLayout('list')}>Lista</Button>
          <Button size="sm" variant={layout === 'timeline' ? 'default' : 'outline'} onClick={() => setLayout('timeline')}>Tidsöversikt</Button>
        </div>
        <Select value={staffFilter} onValueChange={setStaffFilter}>
          <SelectTrigger className="ml-auto h-8 w-[210px] text-xs">
            <SelectValue placeholder="Välj personal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla lageranställda</SelectItem>
            {rows
              .filter((row) => row.staffId)
              .map((row) => (
                <SelectItem key={row.staffId!} value={row.staffId!}>
                  {row.staffName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {layout === 'list' ? (
        <div className="space-y-3 overflow-auto">
          {unstaffed.length > 0 && <section className="rounded-lg border border-amber-300 bg-amber-50/30 p-3">
            <h3 className="mb-3 font-semibold">Behöver bemannas · {unstaffed.length} jobb</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{unstaffed.map(job => <div key={`${job.warehouseEventId || job.title}-${job.date}`}><p className="mb-1 text-xs text-muted-foreground">{job.date}</p><JobCard job={job} onOpen={openJob} unstaffed /></div>)}</div>
          </section>}
          {visibleRows.map(row => {
            const conflicts = conflictingJobs(row.jobs);
            return <section key={row.staffId || row.staffName} className="rounded-lg border bg-background p-3">
              <h3 className="font-semibold">{row.staffName}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{row.jobs.length} jobb · {planningSummary(row.jobs)}{conflicts.size > 0 ? ` · ${conflicts.size} jobb med tidskonflikt` : ''}</p>
              {row.jobs.length === 0 ? <p className="text-sm text-muted-foreground">Inga lagerjobb planerade. Tillgänglighet behöver kontrolleras vid bemanning.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{row.jobs.map(job => <div key={`${job.assignmentId || job.warehouseEventId || job.title}-${job.date}`}><p className="mb-1 text-xs text-muted-foreground">{job.date}</p><JobCard job={job} onOpen={openJob} conflict={conflicts.has(job)} /></div>)}</div>}
            </section>;
          })}
          {visibleRows.length === 0 && unstaffed.length === 0 && <p className="p-6 text-center">Ingen lagerpersonal eller lagerjobb hittades.</p>}
        </div>
      ) : viewMode === 'day' ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-background">
          <div
            className="grid"
            style={{
              minWidth: 64 + (visibleRows.length + (unstaffed.length > 0 ? 1 : 0)) * columnWidth,
              gridTemplateColumns: `64px ${unstaffed.length > 0 ? `${columnWidth}px ` : ''}repeat(${visibleRows.length}, ${columnWidth}px)`,
            }}
          >
            <div className="sticky left-0 top-0 z-40 border-b border-r bg-muted/95 px-1 py-3 text-center text-xs font-semibold text-muted-foreground">
              Tid
            </div>
            {unstaffed.length > 0 && (
              <div className="sticky top-0 z-30 border-b border-r bg-amber-50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" /> Obemannat
                </div>
                <div className="mt-0.5 text-xs text-amber-700">{unstaffed.length} jobb</div>
              </div>
            )}
            {visibleRows.map((row) => (
              <div key={row.staffId ?? row.staffName} className="sticky top-0 z-30 border-b border-r bg-muted/95 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: row.staffColor || 'hsl(var(--warehouse))' }}
                  >
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{row.staffName}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{row.jobs.length} lagerjobb · {planningSummary(row.jobs)}</div>
              </div>
            ))}

            <div className="sticky left-0 z-20 border-r bg-muted/80">
              <div className="flex h-[76px] items-center justify-center border-b px-1 text-center text-[9px] text-muted-foreground">
                Utan tid
              </div>
              <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
                {Array.from({ length: DAY_END_MINUTES / 60 - DAY_START_MINUTES / 60 }).map((_, index) => (
                  <div
                    key={index}
                    className="absolute inset-x-0 -translate-y-1/2 pr-2 text-right text-xs tabular-nums text-muted-foreground"
                    style={{ top: index * HOUR_HEIGHT }}
                  >
                    {String(index + DAY_START_MINUTES / 60).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
            </div>
            {unstaffed.length > 0 && <DayColumn jobs={unstaffed} onOpen={openJob} unstaffed />}
            {visibleRows.map((row) => (
              <DayColumn key={row.staffId ?? row.staffName} jobs={row.jobs} onOpen={openJob} />
            ))}
          </div>
          {visibleRows.length === 0 && unstaffed.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Ingen lagerpersonal eller lagerjobb hittades.</p>
          )}
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-background">
        <div
          className="grid min-w-[1040px]"
          style={{ gridTemplateColumns: '190px repeat(7, minmax(120px, 1fr))' }}
        >
          <div className="sticky left-0 top-0 z-30 border-b border-r bg-muted/90 px-3 py-2 text-xs font-semibold">
            Personal
          </div>
          {days.map((day) => (
            <div key={day.toISOString()} className="sticky top-0 z-20 border-b border-r bg-muted/90 px-2 py-2 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {format(day, 'EEE', { locale: sv })}
              </div>
              <div className="text-sm font-bold">{format(day, 'd MMM', { locale: sv })}</div>
            </div>
          ))}

          {unstaffed.length > 0 && (
            <>
              <div className="sticky left-0 z-10 border-b border-r bg-amber-50 px-3 py-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Obemannat
                </div>
                <div className="mt-1 text-xs text-amber-700">{unstaffed.length} jobb behöver personal</div>
              </div>
              {days.map((day) => {
                const jobs = jobsForDay(unstaffed, day);
                return (
                  <div key={day.toISOString()} className="min-h-24 space-y-1.5 border-b border-r bg-amber-50/30 p-1.5">
                    {jobs.length === 0 ? (
                      <span className="block pt-2 text-center text-xs text-muted-foreground">Inga</span>
                    ) : (
                      jobs.map((job) => (
                        <JobCard key={`${job.warehouseEventId || job.title}-${job.date}`} job={job} onOpen={openJob} unstaffed />
                      ))
                    )}
                  </div>
                );
              })}
            </>
          )}

          {visibleRows.map((row) => (
            <React.Fragment key={row.staffId ?? row.staffName}>
              <div className="sticky left-0 z-10 border-b border-r bg-background px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: row.staffColor || 'hsl(var(--warehouse))' }}
                  >
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{row.staffName}</span>
                  <span className="ml-auto text-xs font-medium text-muted-foreground">{row.jobs.length}</span>
                </div>
              </div>
              {days.map((day) => {
                const jobs = jobsForDay(row.jobs, day);
                return (
                  <div key={day.toISOString()} className="min-h-24 space-y-1.5 border-b border-r p-1.5">
                    {jobs.length > 0 && <p className="text-xs text-muted-foreground">{planningSummary(jobs)}</p>}
                    {jobs.length === 0 ? (
                      <div className="flex h-full min-h-20 items-center justify-center rounded-md border border-dashed border-border/50 text-center text-xs text-muted-foreground">
                        Inga lagerjobb
                      </div>
                    ) : (
                      jobs.map((job) => (
                        <JobCard
                          key={job.assignmentId || `${job.warehouseEventId}-${row.staffId}`}
                          job={job}
                          onOpen={openJob}
                          conflict={conflictingJobs(jobs).has(job)}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        {visibleRows.length === 0 && unstaffed.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Ingen lagerpersonal eller lagerjobb hittades.</p>
        )}
      </div>
      )}
      <WarehouseJobSheet open={!!selectedJob} target={selectedJob} onOpenChange={(open) => { if (!open) setSelectedJob(null); }} />
    </div>
  );
};

export default WarehousePersonnelView;
