import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { StaffGpsDaySummary } from '@/hooks/staff/useStaffGpsWeekSummary';
import { GeofenceVisitRows } from './GeofenceVisitRows';

interface Props {
  day: Date;
  dateStr: string;
  selected: boolean;
  expanded: boolean;
  summary: StaffGpsDaySummary | undefined;
  staffId: string | null;
  staffName: string | null;
  onClick: () => void;
}

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function StaffGpsDayRow({ day, dateStr, selected, expanded, summary, onClick }: Props) {
  const weekday = format(day, 'EEE', { locale: sv });
  const dayMonth = format(day, 'd/M', { locale: sv });
  const hasData = !!summary && summary.pingsCount > 0;
  const hasRange = hasData && summary!.firstIso && summary!.lastIso;
  const hasVisits = hasData && (summary?.visits?.length ?? 0) > 0;

  return (
    <div
      data-date={dateStr}
      className={cn(
        'border-l-[3px] transition-all',
        selected
          ? 'border-[hsl(270_50%_55%)] bg-[hsl(270_45%_96%)]'
          : 'border-transparent hover:bg-[hsl(270_35%_97%)]',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="group relative w-full text-left px-3 py-2.5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={cn(
              'text-[13px] font-semibold capitalize tracking-tight inline-flex items-center gap-1',
              !hasData && 'text-muted-foreground/70',
            )}>
              <span className="text-muted-foreground/60 text-[10px] tabular-nums">
                {expanded ? '▾' : '▸'}
              </span>
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
                {formatStockholmHm(summary!.firstIso!)}<span className="mx-0.5 text-muted-foreground/40">–</span>{formatStockholmHm(summary!.lastIso!)}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-foreground tracking-tight">
                {fmtDur(summary!.durationMin)}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">
              {summary?.isLoading ? 'Laddar…' : hasData ? 'Endast hemma' : '—'}
            </span>
          )}
        </div>
      </button>

      {expanded && hasVisits && (
        <div className="px-2 pb-2">
          <div className="rounded-md border border-[hsl(270_20%_92%)] bg-white overflow-hidden">
            <GeofenceVisitRows visits={summary!.visits} compact />
          </div>
        </div>
      )}
      {expanded && !hasVisits && !summary?.isLoading && (
        <div className="px-3 pb-3 text-[11px] text-muted-foreground/70">
          Inga geofence-besök för denna dag.
        </div>
      )}
    </div>
  );
}
