/**
 * WarehousePersonnelView — "Personal"-läget i lagerplaneringen.
 *
 * Grupperar konkreta lagerjobb per faktisk person (warehouse_assignments).
 * Drar ALDRIG slutsatsen "personen är på Lager 2 idag → personen arbetar på
 * alla Lager 2-jobb". Obemannade jobb listas separat och kan bemannas direkt.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, Clock3, MapPin, UserRound } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import QuickAssignStaffPopover from '@/components/warehouse-ops/QuickAssignStaffPopover';
import { useWarehousePersonnelWeek, type PersonnelJob } from '@/hooks/useWarehousePersonnelWeek';
import { cn } from '@/lib/utils';

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

const JobCard: React.FC<{ job: PersonnelJob; onOpen: (job: PersonnelJob) => void }> = ({ job, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(job)}
    className="w-full text-left rounded-md border border-border/60 bg-background px-2 py-1.5 hover:bg-accent/50 transition-colors"
  >
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[hsl(var(--heading))]">
      <span className="rounded bg-muted px-1 py-0.5 uppercase tracking-wide">
        {ACTIVITY_LABELS[job.activityType] || ACTIVITY_LABELS.other}
      </span>
      {job.bookingNumber && <span className="tabular-nums">{job.bookingNumber}</span>}
    </div>
    <div className="mt-0.5 truncate text-xs">{job.customerName || job.title}</div>
    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3 w-3" />
        {format(new Date(`${job.date}T00:00:00`), 'EEE d MMM', { locale: sv })}
        {job.startTime ? ` ${job.startTime}` : ' · tid saknas'}
      </span>
      {job.deliveryAddress && (
        <span className="inline-flex items-center gap-1 truncate">
          <MapPin className="h-3 w-3" />
          <span className="truncate">{job.deliveryAddress}</span>
        </span>
      )}
    </div>
  </button>
);

const WarehousePersonnelView: React.FC<Props> = ({ currentDate }) => {
  const navigate = useNavigate();
  const rangeStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const rangeEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const { data, isLoading } = useWarehousePersonnelWeek(rangeStart, rangeEnd);

  const openJob = (job: PersonnelJob) => {
    if (job.packingId) navigate(`/warehouse/packing/${job.packingId}`);
    else if (job.bookingId) navigate(`/warehouse/booking/${job.bookingId}`);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const unstaffed = data?.unstaffed ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex gap-2 min-w-full">
        {unstaffed.length > 0 && (
          <div className="w-[230px] shrink-0 rounded-lg border border-amber-300 bg-amber-50/70 p-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Ej bemannat ({unstaffed.length})
            </div>
            <div className="space-y-1.5">
              {unstaffed.map((job) => (
                <div key={job.warehouseEventId} className="space-y-1">
                  <JobCard job={job} onOpen={openJob} />
                  {job.packingId && (
                    <QuickAssignStaffPopover
                      packingId={job.packingId}
                      packingName={job.bookingNumber || job.title}
                      assignedNames={[]}
                      label="Bemanna"
                      muted
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {rows.length === 0 && unstaffed.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Inga lagerjobb den här veckan.</p>
        ) : (
          rows.map((row) => (
            <div key={row.staffId ?? row.staffName} className="w-[230px] shrink-0 rounded-lg border border-border/60 bg-card p-2">
              <div className={cn('flex items-center gap-1.5 text-xs font-bold mb-1.5 text-[hsl(var(--heading))]')}>
                <UserRound className="h-3.5 w-3.5" />
                <span className="truncate">{row.staffName}</span>
                <span className="ml-auto text-[10px] font-medium text-muted-foreground tabular-nums">
                  {row.jobs.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {row.jobs.map((job) => (
                  <JobCard key={job.assignmentId ?? `${job.warehouseEventId}`} job={job} onOpen={openJob} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WarehousePersonnelView;
