/**
 * Warehouse personnel matrix.
 *
 * Rows are actual people and columns are weekdays. Empty cells are rendered
 * explicitly as "Inga lagerjobb" so a manager can see both assignments and
 * gaps without inferring anything from legacy lager-N teams.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns';
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
}

const JobCard: React.FC<{
  job: PersonnelJob;
  onOpen: (job: PersonnelJob) => void;
  unstaffed?: boolean;
}> = ({ job, onOpen, unstaffed = false }) => (
  <div className={`rounded-md border border-border/60 p-1.5 ${getEventBgClass(job.activityType)}`}>
    <button type="button" onClick={() => onOpen(job)} className="block w-full text-left">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[hsl(var(--heading))]">
        <span className={`h-2 w-2 rounded-full shrink-0 ${getEventDotClass(job.activityType)}`} />
        <span className="truncate">{ACTIVITY_LABELS[job.activityType] || ACTIVITY_LABELS.other}</span>
        {job.bookingNumber && <span className="ml-auto tabular-nums truncate">{job.bookingNumber}</span>}
      </div>
      <div className="mt-1 truncate text-xs font-medium">{job.customerName || job.title}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock3 className="h-3 w-3 shrink-0" />
        <span>
          {job.startTime || 'Tid saknas'}
          {job.endTime ? `–${job.endTime}` : ''}
        </span>
      </div>
      {job.deliveryAddress && (
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
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

const WarehousePersonnelView: React.FC<Props> = ({ currentDate }) => {
  const navigate = useNavigate();
  const [staffFilter, setStaffFilter] = useState('all');
  const rangeStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const rangeEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeEnd, rangeStart],
  );
  const { data, isLoading } = useWarehousePersonnelWeek(rangeStart, rangeEnd);

  const openJob = (job: PersonnelJob) => {
    if (job.packingId) navigate(`/warehouse/packing/${job.packingId}`);
    else if (job.bookingId) navigate(`/warehouse/bookings/${job.bookingId}`);
  };

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

  const rows = data?.rows ?? [];
  const unstaffed = data?.unstaffed ?? [];
  const visibleRows = staffFilter === 'all' ? rows : rows.filter((row) => row.staffId === staffFilter);
  const totalJobs = rows.reduce((sum, row) => sum + row.jobs.length, 0);

  const jobsForDay = (jobs: PersonnelJob[], day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    return jobs.filter((job) => job.date === key);
  };

  return (
    <div className="min-h-0 flex-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-warehouse" />
          <span className="text-sm font-semibold">Personalens lagervecka</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} personer · {totalJobs} bemannade jobb · {unstaffed.length} obemannade
        </span>
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
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                <div className="mt-1 text-[10px] text-amber-700">{unstaffed.length} jobb behöver personal</div>
              </div>
              {days.map((day) => {
                const jobs = jobsForDay(unstaffed, day);
                return (
                  <div key={day.toISOString()} className="min-h-24 space-y-1.5 border-b border-r bg-amber-50/30 p-1.5">
                    {jobs.length === 0 ? (
                      <span className="block pt-2 text-center text-[10px] text-muted-foreground">Inga</span>
                    ) : (
                      jobs.map((job) => (
                        <JobCard key={job.warehouseEventId || job.title} job={job} onOpen={openJob} unstaffed />
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
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground">{row.jobs.length}</span>
                </div>
              </div>
              {days.map((day) => {
                const jobs = jobsForDay(row.jobs, day);
                return (
                  <div key={day.toISOString()} className="min-h-24 space-y-1.5 border-b border-r p-1.5">
                    {jobs.length === 0 ? (
                      <div className="flex h-full min-h-20 items-center justify-center rounded-md border border-dashed border-border/50 text-center text-[10px] text-muted-foreground">
                        Inga lagerjobb
                      </div>
                    ) : (
                      jobs.map((job) => (
                        <JobCard
                          key={job.assignmentId || `${job.warehouseEventId}-${row.staffId}`}
                          job={job}
                          onOpen={openJob}
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
    </div>
  );
};

export default WarehousePersonnelView;
