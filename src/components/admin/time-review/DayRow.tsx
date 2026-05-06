import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniTimelineBar } from './MiniTimelineBar';
import { DayApprovalAction } from './DayApprovalAction';
import {
  evaluateDayApprovalState,
  type DayApprovalState,
} from '@/lib/admin/adminTimeReviewEngine';
import type { DayReviewRow } from '@/lib/admin/timeReviewQueries';
import { extractUTCTime } from '@/utils/dateUtils';

const fmtMinutes = (m: number) => {
  if (!m) return '0h 0m';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('') || '?';

const safeFormat = (value: string | null | undefined, pattern: string) => {
  if (!value) return null;
  if (pattern === 'HH:mm') return extractUTCTime(value);
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, pattern, { locale: sv });
};

const STATUS_LABEL: Record<DayApprovalState, string> = {
  in_progress: 'Pågående',
  ready_for_approval: 'Redo',
  approved: 'Godkänd',
  requires_correction: 'Redo',
};

const STATUS_TONE: Record<DayApprovalState, string> = {
  in_progress: 'bg-muted text-muted-foreground border-border',
  ready_for_approval: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  approved: 'bg-primary/15 text-primary border-primary/30',
  requires_correction: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
};

const useNowTick = (active: boolean) => {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
};

const elapsed = (sinceIso: string) => {
  const start = new Date(sinceIso).getTime();
  const diff = Math.max(0, Date.now() - start);
  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
};

export interface DayRowProps {
  row: DayReviewRow;
  onClick: (row: DayReviewRow) => void;
}

export const DayRow: React.FC<DayRowProps> = ({ row, onClick }) => {
  const isActive = !!row.workdayStart && !row.workdayEnd;
  const isClosed = !!row.workdayStart && !!row.workdayEnd;

  // Find current open activity (work entry without end_time on an active day).
  const openEntry = isActive
    ? row.workEntries.find((e) => e.start_time && !e.end_time && !e.is_subdivision)
    : null;

  // Try to map openEntry's booking → friendly project name via plannedJobs.
  // (booking_id finns på time_reports men exponeras inte i ReviewWorkEntry-typen,
  //  så vi fallback:ar till första planerade jobbet om vi inte har match.)
  const currentProject =
    row.plannedJobs[0]?.client ||
    row.plannedJobs[0]?.bookingNumber ||
    null;

  useNowTick(isActive && !!openEntry);

  const status = evaluateDayApprovalState(row.result, {
    workday: row.workdayStart ? { started_at: row.workdayStart, ended_at: row.workdayEnd } : null,
    openTimer: openEntry?.start_time ? { startTime: openEntry.start_time } : null,
    assistantEvents: [],
    reviewStatus: row.reviewStatus,
  });

  const statusLabel = isClosed && status.state === 'in_progress' ? 'Avslutad' : STATUS_LABEL[status.state];
  const statusTone = isClosed && status.state === 'in_progress'
    ? 'bg-slate-200 text-slate-700 border-slate-300'
    : STATUS_TONE[status.state];

  const dayLabel = safeFormat(`${row.date}T00:00:00`, 'EEEE d MMM') ?? row.date;
  const startLabel = safeFormat(row.workdayStart, 'HH:mm') ?? '–';
  const endLabel = safeFormat(row.workdayEnd, 'HH:mm') ?? '–';
  const payable = row.result.metrics.reportedActivityMinutes + row.result.metrics.travelMinutes;

  const reviewCount = row.result.anomalies.length;
  const showReview = reviewCount > 0;

  const accent = isActive
    ? 'border-l-emerald-500'
    : isClosed
      ? 'border-l-slate-400'
      : 'border-l-sky-400';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(row)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(row); }}
      className={cn(
        'group w-full text-left rounded-xl border bg-card hover:bg-accent/40 hover:shadow-sm transition-all px-4 py-3 flex flex-col gap-3 border-l-4 cursor-pointer',
        accent,
      )}
    >
      {/* TOPPRAD: namn · datum · start · lönegrundande · status */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: row.staffColor || 'hsl(var(--primary))' }}
        >
          {initials(row.staffName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{row.staffName}</p>
            <span className="text-xs text-muted-foreground capitalize">{dayLabel}</span>
            {showReview && (
              <span title={`${reviewCount} sak(er) att granska`} className="inline-flex items-center text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold ml-0.5">{reviewCount}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
            <span>
              <span className="text-[10px] uppercase tracking-wider mr-1">Start</span>
              <span className="font-mono font-semibold text-foreground">{startLabel}</span>
            </span>
            <span>
              <span className="text-[10px] uppercase tracking-wider mr-1">Lönegrundande</span>
              <span className="font-mono font-semibold text-foreground">{fmtMinutes(payable)}</span>
            </span>
          </div>
        </div>

        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0',
            statusTone,
          )}
        >
          {statusLabel}
        </span>

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

      {/* AKTIV / AVSLUTAD-PANEL */}
      {isActive && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                På projekt nu
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground truncate mt-0.5">
              {currentProject ?? 'Pågående aktivitet'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              sedan {safeFormat(openEntry?.start_time ?? row.workdayStart, 'HH:mm') ?? '–'}
            </div>
          </div>
          {openEntry?.start_time && (
            <div className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
              {elapsed(openEntry.start_time)}
            </div>
          )}
        </div>
      )}

      {isClosed && (
        <div className="rounded-lg bg-muted/60 border border-border px-3 py-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Avslutad
            </span>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              slut {endLabel}
            </div>
          </div>
          <div className="font-mono text-lg font-bold text-foreground tabular-nums">
            {fmtMinutes(payable)}
          </div>
        </div>
      )}

      {/* TIMELINE */}
      <MiniTimelineBar
        date={row.date}
        workday={row.workdayStart ? { started_at: row.workdayStart, ended_at: row.workdayEnd } : null}
        workEntries={row.workEntries}
        travelSegments={row.travelSegments}
      />
    </div>
  );
};

export default DayRow;
