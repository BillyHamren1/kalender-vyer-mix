import React from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, Car, AlertTriangle, ChevronRight, CalendarClock, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DayStatusBadge } from './DayStatusBadge';
import { MiniTimelineBar } from './MiniTimelineBar';
import { DayApprovalAction } from './DayApprovalAction';
import type { DayReviewRow } from '@/lib/admin/timeReviewQueries';

const fmtMinutes = (m: number) => {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm.toString().padStart(2, '0')}m` : `${mm}m`;
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('') || '?';

export interface DayRowProps {
  row: DayReviewRow;
  onClick: (row: DayReviewRow) => void;
}

export const DayRow: React.FC<DayRowProps> = ({ row, onClick }) => {
  const m = row.result.metrics;
  const status = row.result.status;

  const isPlannedOnly = !row.workdayStart && row.plannedJobs.length > 0;
  const accent =
    status === 'critical'
      ? 'border-l-destructive'
      : status === 'warning'
        ? 'border-l-amber-500'
        : row.workdayStart && !row.workdayEnd
          ? 'border-l-teal-500'
          : isPlannedOnly
            ? 'border-l-sky-400'
            : 'border-l-emerald-500';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(row)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(row); }}
      className={cn(
        'group w-full text-left rounded-xl border bg-card hover:bg-accent/40 hover:shadow-sm transition-all px-4 py-3 flex flex-col gap-2 border-l-4 cursor-pointer',
        accent,
      )}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: row.staffColor || 'hsl(var(--primary))' }}
        >
          {initials(row.staffName)}
        </div>

        {/* Name + date */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{row.staffName}</p>
            <DayStatusBadge result={row.result} />
            {row.reviewStatus === 'approved' && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Godkänd
              </span>
            )}
            {row.reviewStatus === 'needs_review' && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded">
                Markerad
              </span>
            )}
            {isPlannedOnly && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 bg-sky-500/10 px-1.5 py-0.5 rounded">
                Planerad
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {format(parseISO(`${row.date}T00:00:00`), 'EEEE d MMM', { locale: sv })}
            {row.workdayStart ? (
              <>
                <span className="mx-1.5">·</span>
                {format(parseISO(row.workdayStart), 'HH:mm')}
                {row.workdayEnd ? `–${format(parseISO(row.workdayEnd), 'HH:mm')}` : '– pågår'}
              </>
            ) : row.plannedStart ? (
              <>
                <span className="mx-1.5">·</span>
                <span className="inline-flex items-center gap-1 normal-case text-muted-foreground/80">
                  <CalendarClock className="w-3 h-3" />
                  Planerad {format(parseISO(row.plannedStart), 'HH:mm')}
                  {row.plannedEnd ? `–${format(parseISO(row.plannedEnd), 'HH:mm')}` : ''}
                </span>
              </>
            ) : null}
          </p>
          {row.plannedJobs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.plannedJobs.slice(0, 4).map((job) => {
                const inferred =
                  job.start && job.end &&
                  row.workEntries.some((e) => e.start_time && e.end_time &&
                    new Date(e.start_time).getTime() < new Date(job.end!).getTime() &&
                    new Date(e.end_time).getTime() > new Date(job.start!).getTime());
                return (
                  <span
                    key={job.bookingId}
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border',
                      inferred
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                        : 'bg-muted/40 border-border text-muted-foreground',
                    )}
                    title={`${job.bookingNumber ?? ''} ${job.client ?? ''}${inferred ? ' — rapporterad' : ' — ej rapporterad'}`}
                  >
                    <Briefcase className="w-2.5 h-2.5" />
                    {job.bookingNumber ?? job.client ?? job.bookingId.slice(0, 6)}
                    {job.start && (
                      <span className="opacity-70">
                        {format(parseISO(job.start), 'HH:mm')}
                        {job.end ? `–${format(parseISO(job.end), 'HH:mm')}` : ''}
                      </span>
                    )}
                  </span>
                );
              })}
              {row.plannedJobs.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{row.plannedJobs.length - 4}</span>
              )}
            </div>
          )}
        </div>

        {/* Numbers */}
        <div className="hidden md:flex items-center gap-5 text-xs shrink-0">
          <Stat icon={<Clock className="w-3 h-3 text-muted-foreground" />} label="Dag" value={fmtMinutes(m.workdayMinutes)} />
          <Stat label="Rapport" value={fmtMinutes(m.reportedActivityMinutes)} tone="text-emerald-700" />
          <Stat icon={<Car className="w-3 h-3 text-amber-600" />} label="Resa" value={fmtMinutes(m.travelMinutes)} tone={m.travelMinutes ? 'text-amber-700' : 'text-muted-foreground'} />
          <Stat
            icon={m.unallocatedMinutes ? <AlertTriangle className="w-3 h-3 text-destructive" /> : null}
            label="Oallokerat"
            value={fmtMinutes(m.unallocatedMinutes)}
            tone={m.unallocatedMinutes ? 'text-destructive' : 'text-muted-foreground'}
          />
        </div>

        {/* Approval action — stop propagation so click doesn't open dialog */}
        <div className="hidden lg:flex shrink-0" onClick={(e) => e.stopPropagation()}>
          <DayApprovalAction
            workdayId={row.workdayId}
            workday={row.workdayStart ? { started_at: row.workdayStart, ended_at: row.workdayEnd } : null}
            result={row.result}
            reviewStatus={row.reviewStatus}
            variant="compact"
          />
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
      </div>

      {/* Mini timeline */}
      <MiniTimelineBar
        date={row.date}
        workday={row.workdayStart ? { started_at: row.workdayStart, ended_at: row.workdayEnd } : null}
        workEntries={row.workEntries}
        travelSegments={row.travelSegments}
      />
    </div>
  );
};

const Stat: React.FC<{ icon?: React.ReactNode; label: string; value: string; tone?: string }> = ({ icon, label, value, tone }) => (
  <div className="flex flex-col items-end leading-tight">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
      {icon}{label}
    </span>
    <span className={cn('font-mono font-bold tabular-nums', tone || 'text-foreground')}>{value}</span>
  </div>
);

export default DayRow;
