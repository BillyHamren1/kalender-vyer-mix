import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { StaffGpsDaySummary } from '@/hooks/staff/useStaffGpsWeekSummary';

interface Props {
  day: Date;
  dateStr: string;
  selected: boolean;
  summary: StaffGpsDaySummary | undefined;
  onClick: () => void;
}

function formatDuration(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function StaffGpsDayRow({ day, dateStr, selected, summary, onClick }: Props) {
  const weekday = format(day, 'EEE', { locale: sv });
  const dayMonth = format(day, 'd/M', { locale: sv });
  const hasData = !!summary && summary.pingsCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      data-date={dateStr}
      className={cn(
        'w-full text-left px-3 py-2 border-l-2 transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:bg-muted/50',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('text-sm font-medium capitalize', !hasData && 'text-muted-foreground')}>
          {weekday} {dayMonth}
        </span>
        <span className={cn('text-xs font-mono', hasData ? 'text-foreground' : 'text-muted-foreground')}>
          {hasData ? formatDuration(summary!.durationMin) : '—'}
        </span>
      </div>
      {hasData ? (
        <>
          <div className="text-xs font-mono text-muted-foreground mt-0.5">
            {formatStockholmHm(summary!.firstIso)} → {formatStockholmHm(summary!.lastIso)}
          </div>
          {summary!.placeNames.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {summary!.placeNames.slice(0, 3).join(', ')}
              {summary!.placeNames.length > 3 && ` +${summary!.placeNames.length - 3}`}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-muted-foreground mt-0.5">
          {summary?.isLoading ? 'Laddar…' : 'Ingen GPS-data'}
        </div>
      )}
    </button>
  );
}
