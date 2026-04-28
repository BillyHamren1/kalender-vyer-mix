import React from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, Car, AlertTriangle, ChevronRight } from 'lucide-react';
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

  const accent =
    status === 'critical'
      ? 'border-l-destructive'
      : status === 'warning'
        ? 'border-l-amber-500'
        : row.workdayStart && !row.workdayEnd
          ? 'border-l-teal-500'
          : 'border-l-emerald-500';

  return (
    <button
      type="button"
      onClick={() => onClick(row)}
      className={cn(
        'group w-full text-left rounded-xl border bg-card hover:bg-accent/40 hover:shadow-sm transition-all px-4 py-3 flex flex-col gap-2 border-l-4',
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
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {format(parseISO(`${row.date}T00:00:00`), 'EEEE d MMM', { locale: sv })}
            {row.workdayStart && (
              <>
                <span className="mx-1.5">·</span>
                {format(parseISO(row.workdayStart), 'HH:mm')}
                {row.workdayEnd ? `–${format(parseISO(row.workdayEnd), 'HH:mm')}` : '– pågår'}
              </>
            )}
          </p>
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

        <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
      </div>

      {/* Mini timeline */}
      <MiniTimelineBar
        date={row.date}
        workday={row.workdayStart ? { started_at: row.workdayStart, ended_at: row.workdayEnd } : null}
        workEntries={row.workEntries}
        travelSegments={row.travelSegments}
      />
    </button>
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
