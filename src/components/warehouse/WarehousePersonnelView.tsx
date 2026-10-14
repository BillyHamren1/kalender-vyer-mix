/**
 * Warehouse personnel matrix.
 *
 * Rows are actual people and columns are weekdays. Empty cells are rendered
 * explicitly as "Inga lagerjobb" so a manager can see both assignments and
 * gaps without inferring anything from legacy lager-N teams.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import WarehouseJobSheet from '@/components/warehouse/WarehouseJobSheet';
import { Button } from '@/components/ui/button';
import { clockMinutes, planningSummary, conflictingJobs, timelineLanes } from '@/lib/warehouse/personnelPlanning';
import { eachDayOfInterval, endOfWeek, format, startOfDay, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, ArrowRight, Clock3, MapPin, UserRound, UsersRound } from 'lucide-react';
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
const COLUMN_WIDTH = 264;
const UNTIMED_HEIGHT = 96;
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
  <div className={`overflow-hidden rounded-xl border border-black/5 p-3 shadow-sm ${getEventBgClass(job.activityType)}`}>
    <button type="button" onClick={() => onOpen(job)} className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-warehouse focus-visible:ring-offset-2">
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
  showUntimed: boolean;
  scrollRef?: (element: HTMLDivElement | null) => void;
}> = ({ jobs, onOpen, unstaffed = false, showUntimed, scrollRef }) => {
  const untimed = jobs.filter((job) => timelinePosition(job) === null);
  const timed = jobs.filter((job) => timelinePosition(job) !== null);
  const conflicts = conflictingJobs(jobs);
  const layout = timelineLanes(timed.map(job => ({ job, top: Number(timelinePosition(job)!.top), height: Number(timelinePosition(job)!.height) })));

  return (
    <div ref={scrollRef} tabIndex={layout.laneCount > 2 ? 0 : undefined} aria-label={layout.laneCount > 2 ? 'Överlappande jobb, bläddra i sidled för att se alla' : undefined} className={`min-w-0 overflow-x-auto border-r border-border/25 ${unstaffed ? 'bg-warehouse-muted/15' : 'bg-card'}`}>
      <div style={{ minWidth: Math.max(COLUMN_WIDTH, layout.laneCount * 132) }}>
      {showUntimed && <div className="space-y-1 overflow-y-auto border-b border-border/25 p-2" style={{ height: UNTIMED_HEIGHT }}>
        {untimed.length === 0 ? (
          <span className="block pt-5 text-center text-xs text-muted-foreground">—</span>
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
      </div>}
      <div
        className="relative"
        style={{
          height: TIMELINE_HEIGHT,
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 55px, hsl(var(--border) / 0.22) 55px, hsl(var(--border) / 0.22) 56px)',
        }}
      >
        {layout.items.map(({ job, top, height, lane }) => (
          <div key={`${job.assignmentId || job.warehouseEventId || job.title}-${job.date}`}
            className="absolute z-10 px-1"
            style={{ top, height, left: `${lane / layout.laneCount * 100}%`, width: `${100 / layout.laneCount}%` }}>
            <button type="button" onClick={() => onOpen(job)}
              title={`${job.title} · ${job.startTime}–${job.endTime}${conflicts.has(job) ? ' · Tidskonflikt' : ''}`}
              aria-label={`${job.title} ${job.startTime}–${job.endTime}${conflicts.has(job) ? ' Tidskonflikt' : ''}`}
              className={`h-full w-full overflow-hidden rounded-lg border p-2 text-left text-xs shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-warehouse focus-visible:ring-inset ${getEventBgClass(job.activityType)} ${conflicts.has(job) ? 'border-amber-600' : 'border-black/5'}`}>
              <span className={`mb-1 block h-1 w-6 rounded-full ${getEventDotClass(job.activityType)}`} />
              <span className="block font-semibold truncate">{job.customerName || job.title}</span>
              <span className="block tabular-nums">{job.startTime}–{job.endTime}</span>
              {conflicts.has(job) && <span className="block font-semibold">Tidskonflikt</span>}
            </button>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};

const LaneNavigation = ({ jobs, label, onScroll }: {jobs: PersonnelJob[]; label: string; onScroll: (direction: number) => void}) => {
  const lanes = timelineLanes(jobs.flatMap(job => {
    const position = timelinePosition(job);
    return position ? [{job, top: Number(position.top), height: Number(position.height)}] : [];
  })).laneCount;
  if (lanes <= 2) return null;
  return <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
    <span>{lanes} parallella jobb</span>
    <div className="flex gap-1">
      <button type="button" aria-label={`Visa tidigare jobb för ${label}`} onClick={() => onScroll(-1)} className="rounded p-1 hover:bg-warehouse-muted focus-visible:ring-2 focus-visible:ring-warehouse"><ArrowLeft className="h-3.5 w-3.5" /></button>
      <button type="button" aria-label={`Visa fler jobb för ${label}`} onClick={() => onScroll(1)} className="rounded p-1 hover:bg-warehouse-muted focus-visible:ring-2 focus-visible:ring-warehouse"><ArrowRight className="h-3.5 w-3.5" /></button>
    </div>
  </div>;
};

const WarehousePersonnelView: React.FC<Props> = ({ currentDate, viewMode }) => {
  const [selectedJob, setSelectedJob] = useState<PersonnelJob | null>(null);
  const [layout, setLayout] = useState<'list' | 'timeline'>('list');
  const [staffFilter, setStaffFilter] = useState('all');
  const timelineRef = useRef<HTMLDivElement>(null);
  const positionedTimeline = useRef('');
  const columnScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollColumn = (key: string, direction: number) => columnScrollRefs.current[key]?.scrollBy({left: direction * 264, behavior: 'smooth'});
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
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  useEffect(() => {
    if (layout !== 'timeline' || viewMode !== 'day') {
      positionedTimeline.current = '';
      return;
    }
    if (!timelineRef.current || !data || isLoading) return;
    const key = `${dateKey}:${staffFilter}`;
    if (positionedTimeline.current === key) return;
    const jobs = [...data.unstaffed, ...data.rows.filter(row => staffFilter === 'all' || row.staffId === staffFilter).flatMap(row => row.jobs)];
    const starts = jobs.map(job => clockMinutes(job.startTime)).filter((value): value is number => value !== null);
    const firstMinute = starts.length ? Math.min(...starts) : 7 * 60;
    // Start close to the first job; midnight and late work remain reachable.
    timelineRef.current.scrollTop = jobs.some(job => clockMinutes(job.startTime) === null) ? 0 : Math.max(0, firstMinute - 30) / 60 * HOUR_HEIGHT;
    positionedTimeline.current = key;
  }, [data, dateKey, isLoading, layout, staffFilter, viewMode]);

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

  const columnWidth = COLUMN_WIDTH;
  const showUntimed = [unstaffed, ...visibleRows.map(row => row.jobs)].some(jobs => jobs.some(job => timelinePosition(job) === null));
  return (
    <div className="min-h-0 flex-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/25 bg-card px-4 py-3 shadow-sm">
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
          <Button size="sm" variant="ghost" className={layout === 'list' ? 'bg-warehouse-muted text-warehouse-dark hover:bg-warehouse-muted' : 'text-muted-foreground'} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>Lista</Button>
          <Button size="sm" variant="ghost" className={layout === 'timeline' ? 'bg-warehouse-muted text-warehouse-dark hover:bg-warehouse-muted' : 'text-muted-foreground'} aria-pressed={layout === 'timeline'} onClick={() => setLayout('timeline')}>Tidsöversikt</Button>
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
            return <section key={row.staffId || row.staffName} className="rounded-xl border border-border/25 bg-card p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-warehouse-muted text-sm text-warehouse-dark">{row.staffName.slice(0, 1)}</span>{row.staffName}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{row.jobs.length} jobb · {planningSummary(row.jobs)}{conflicts.size > 0 ? ` · ${conflicts.size} jobb med tidskonflikt` : ''}</p>
              {row.jobs.length === 0 ? <p className="text-sm text-muted-foreground">Inga lagerjobb planerade. Tillgänglighet behöver kontrolleras vid bemanning.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{row.jobs.map(job => <div key={`${job.assignmentId || job.warehouseEventId || job.title}-${job.date}`}><p className="mb-1 text-xs text-muted-foreground">{job.date}</p><JobCard job={job} onOpen={openJob} conflict={conflicts.has(job)} /></div>)}</div>}
            </section>;
          })}
          {visibleRows.length === 0 && unstaffed.length === 0 && <p className="p-6 text-center">Ingen lagerpersonal eller lagerjobb hittades.</p>}
        </div>
      ) : viewMode === 'day' ? (
        <div ref={timelineRef} data-testid="personnel-day-timeline" className="min-h-0 max-h-[70vh] flex-1 overflow-auto rounded-xl border border-border/25 bg-card shadow-sm">
          <div
            className="grid"
            style={{
              minWidth: 64 + (visibleRows.length + (unstaffed.length > 0 ? 1 : 0)) * columnWidth,
              gridTemplateColumns: `64px ${unstaffed.length > 0 ? `${columnWidth}px ` : ''}repeat(${visibleRows.length}, ${columnWidth}px)`,
            }}
          >
            <div className="sticky left-0 top-0 z-40 border-b border-r border-border/25 bg-card px-1 py-3 text-center text-xs font-semibold text-muted-foreground">
              Tid
            </div>
            {unstaffed.length > 0 && (
              <div className="sticky top-0 z-30 border-b border-r bg-amber-50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" /> Obemannat
                </div>
                <div className="mt-0.5 text-xs text-amber-700">{unstaffed.length} jobb</div>
                <LaneNavigation jobs={unstaffed} label="obemannat" onScroll={direction => scrollColumn('unstaffed', direction)} />
              </div>
            )}
            {visibleRows.map((row) => (
              <div key={row.staffId ?? row.staffName} className="sticky top-0 z-30 border-b border-r border-border/25 bg-card px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: row.staffColor || 'hsl(var(--warehouse))' }}
                  >
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{row.staffName}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{row.jobs.length} lagerjobb · {planningSummary(row.jobs)}</div>
                <LaneNavigation jobs={row.jobs} label={row.staffName} onScroll={direction => scrollColumn(row.staffId ?? row.staffName, direction)} />
              </div>
            ))}

            <div className="sticky left-0 z-20 border-r bg-card">
              <div className="flex items-center justify-center border-b border-border/25 px-1 text-center text-[10px] text-muted-foreground" style={{ height: showUntimed ? UNTIMED_HEIGHT : 0 }}>
                {showUntimed && 'Utan tid'}
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
            {unstaffed.length > 0 && <DayColumn jobs={unstaffed} onOpen={openJob} unstaffed showUntimed={showUntimed} scrollRef={element => { columnScrollRefs.current.unstaffed = element; }} />}
            {visibleRows.map((row) => (
              <DayColumn key={row.staffId ?? row.staffName} jobs={row.jobs} onOpen={openJob} showUntimed={showUntimed} scrollRef={element => { columnScrollRefs.current[row.staffId ?? row.staffName] = element; }} />
            ))}
          </div>
          {visibleRows.length === 0 && unstaffed.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Ingen lagerpersonal eller lagerjobb hittades.</p>
          )}
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-card">
        <div
          className="grid min-w-[1040px]"
          style={{ gridTemplateColumns: '190px repeat(7, minmax(120px, 1fr))' }}
        >
          <div className="sticky left-0 top-0 z-30 border-b border-r border-border/25 bg-card px-3 py-2 text-xs font-semibold">
            Personal
          </div>
          {days.map((day) => (
            <div key={day.toISOString()} className="sticky top-0 z-20 border-b border-r border-border/25 bg-card px-2 py-2 text-center">
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
              <div className="sticky left-0 z-10 border-b border-r border-border/25 bg-card px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-xl text-white"
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
