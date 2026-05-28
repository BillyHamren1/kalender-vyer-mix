import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { StaffGpsDaySummary } from '@/hooks/staff/useStaffGpsWeekSummary';
import type { SegmentType } from '@/lib/staff-gps/dayPartition';
import { toReportRows, summarizeReportRows } from '@/lib/staff-gps/reportRowFilter';
import { inferLastPingReason } from '@/lib/staff-gps/lastPingReason';

interface Props {
  day: Date;
  dateStr: string;
  selected: boolean;
  summary: StaffGpsDaySummary | undefined;
  staffId: string | null;
  staffName: string | null;
  onClick: () => void;
  /**
   * 'report'  → ren tidrapport-vy: bara work + riktig travel, sandwich-merge,
   *             leading/trailing icke-arbete kapas. Default.
   * 'evidence'→ full GPS-partition (gps_gap, unknown_place, private synliga).
   */
  mode?: 'report' | 'evidence';
}

function fmtDur(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const SEGMENT_DOT: Record<SegmentType, string> = {
  work: 'bg-emerald-500',
  private: 'bg-violet-500',
  travel: 'bg-sky-500',
  unknown_place: 'bg-amber-500',
  gps_gap: 'bg-zinc-400',
  idle: 'bg-zinc-300',
};

const SEGMENT_LABEL_COLOR: Record<SegmentType, string> = {
  work: 'text-foreground/85',
  private: 'text-violet-700/80',
  travel: 'text-sky-700/80',
  unknown_place: 'text-amber-700/85',
  gps_gap: 'text-zinc-500',
  idle: 'text-zinc-500',
};

export function StaffGpsDayRow({ day, dateStr, selected, summary, onClick, mode = 'report' }: Props) {
  const weekday = format(day, 'EEE', { locale: sv });
  const dayMonth = format(day, 'd/M', { locale: sv });
  const hasData = !!summary && summary.pingsCount > 0;

  const rawSegments = summary?.segments ?? [];

  // I 'report'-läget kör vi rena rapport-rader (work + riktig travel, merge).
  // I 'evidence'-läget kör vi gamla beteendet (alla typer >=1m, work/private alltid).
  const reportRows = mode === 'report' ? toReportRows(rawSegments) : [];
  const reportSummary = mode === 'report' ? summarizeReportRows(reportRows, rawSegments) : null;

  const segments =
    mode === 'report'
      ? reportRows
      : rawSegments.filter(
          (s) => s.type === 'work' || s.type === 'private' || s.minutes >= 1,
        );

  // I rapport-läget: fönstret = första rapport-rads start till sista rapport-rads end.
  // Faller tillbaka till hela GPS-fönstret om inga rapport-rader finns.
  const firstIso = mode === 'report' && reportRows.length > 0 ? reportRows[0].start : summary?.firstIso ?? null;
  const lastIso = mode === 'report' && reportRows.length > 0 ? reportRows[reportRows.length - 1].end : summary?.lastIso ?? null;
  const windowMin = mode === 'report' && reportSummary
    ? Math.round((new Date(lastIso!).getTime() - new Date(firstIso!).getTime()) / 60_000)
    : summary?.windowMin ?? 0;

  const workMin = mode === 'report' && reportSummary ? reportSummary.workMin : summary?.workMin ?? 0;
  const travelMin = mode === 'report' && reportSummary ? reportSummary.travelMin : summary?.travelMin ?? 0;

  const hasRange = hasData && firstIso && lastIso && reportRows.length > 0;

  if (import.meta.env.DEV && mode === 'report' && hasData && reportSummary) {
    // eslint-disable-next-line no-console
    console.debug('[StaffGpsDayRow]', dateStr, {
      reportSourceUsed: reportSummary.reportSourceUsed,
      visibleReportRowsCount: reportSummary.visibleReportRowsCount,
      hiddenEvidenceRowsCount: reportSummary.hiddenEvidenceRowsCount,
      hiddenEvidenceKinds: reportSummary.hiddenEvidenceKinds,
      mergedSameTargetRowsCount: reportSummary.mergedSameTargetRowsCount,
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-date={dateStr}
      className={cn(
        'group relative w-full text-left px-3 py-2.5 transition-all',
        'border-l-[3px]',
        selected
          ? 'border-[hsl(270_50%_55%)] bg-[hsl(270_45%_96%)]'
          : 'border-transparent hover:bg-[hsl(270_35%_97%)]',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={cn(
            'text-[13px] font-semibold capitalize tracking-tight',
            !hasData && 'text-muted-foreground/70',
          )}>
            {weekday}
          </span>
          <span className={cn(
            'text-[11px] tabular-nums',
            hasData ? 'text-muted-foreground' : 'text-muted-foreground/50',
          )}>
            {dayMonth}
          </span>
        </div>
        {hasRange ? (
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-[11px] tabular-nums text-muted-foreground/80">
              {formatStockholmHm(firstIso!)}
              <span className="mx-0.5 text-muted-foreground/40">–</span>
              {formatStockholmHm(lastIso!)}
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-foreground tracking-tight">
              {fmtDur(windowMin)}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground/60">
            {summary?.isLoading ? 'Laddar…' : hasData ? 'Endast underlag' : '—'}
          </span>
        )}
      </div>

      {hasData && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] tabular-nums text-muted-foreground/85">
          <span><span className="font-semibold text-foreground/80">Arbete</span> {fmtDur(workMin)}</span>
          {travelMin > 0 && <span>Resa {fmtDur(travelMin)}</span>}
          {mode === 'evidence' && summary!.unknownMin > 0 && <span>Okänt {fmtDur(summary!.unknownMin)}</span>}
          {mode === 'evidence' && summary!.gapMin > 0 && <span>GPS-glapp {fmtDur(summary!.gapMin)}</span>}
          {mode === 'evidence' && summary!.privateMin > 0 && <span>Privat {fmtDur(summary!.privateMin)}</span>}
        </div>
      )}

      {segments.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {segments.filter((s) => s.type !== 'idle').map((s, idx) => {
            const isTravelish =
              s.type === 'travel' || s.type === 'gps_gap' || s.type === 'unknown_place';
            const from = s.fromLabel?.trim();
            const to = s.toLabel?.trim();
            const routeLabel = isTravelish && (from || to)
              ? `${s.label} ${from ?? '—'} → ${to ?? '—'}`
              : s.label;
            return (
              <li
                key={`${s.start}-${idx}`}
                className="flex items-baseline justify-between gap-3 text-[11.5px] leading-snug"
              >
                <span className="flex items-baseline gap-1.5 min-w-0">
                  <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0 translate-y-[-1px]', SEGMENT_DOT[s.type])} />
                  <span className={cn('truncate', SEGMENT_LABEL_COLOR[s.type])}>{routeLabel}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
                    {formatStockholmHm(s.start)}–{formatStockholmHm(s.end)}
                  </span>
                </span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {fmtDur(s.minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {mode === 'report' && reportSummary && reportSummary.hiddenEvidenceRowsCount > 0 && (
        <div className="mt-1 text-[10px] text-muted-foreground/60 italic">
          Underlag: {fmtDur(reportSummary.hiddenEvidenceMin)} dolt
          {reportSummary.hiddenEvidenceKinds.length > 0 && (
            <> ({reportSummary.hiddenEvidenceKinds.map((k) => {
              if (k === 'gps_gap') return 'GPS-glapp';
              if (k === 'unknown_place') return 'okänt';
              if (k === 'private') return 'privat';
              if (k === 'travel') return 'intern rörelse';
              return k;
            }).join(', ')})</>
          )}
        </div>
      )}
    </button>
  );
}
