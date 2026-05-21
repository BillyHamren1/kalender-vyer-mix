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

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

export function StaffGpsDayRow({ day, dateStr, selected, summary, onClick }: Props) {
  const weekday = format(day, 'EEE', { locale: sv });
  const dayMonth = format(day, 'd/M', { locale: sv });
  const hasData = !!summary && summary.pingsCount > 0;
  const hasRange = hasData && summary!.firstIso && summary!.lastIso;

  return (
    <button
      type="button"
      onClick={onClick}
      data-date={dateStr}
      className={cn(
        'w-full text-left px-2.5 py-1.5 border-l-2 transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:bg-muted/50',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 leading-tight">
        <span className={cn('text-[12px] font-medium capitalize', !hasData && 'text-muted-foreground')}>
          {weekday} {dayMonth}
        </span>
        {hasRange ? (
          <span className="text-[11px] font-mono text-muted-foreground">
            {formatStockholmHm(summary!.firstIso!)}–{formatStockholmHm(summary!.lastIso!)}
            <span className="ml-1.5 text-foreground">{fmtDur(summary!.durationMin)}</span>
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {summary?.isLoading ? 'Laddar…' : hasData ? 'Endast hemma' : '—'}
          </span>
        )}
      </div>
      {hasData && summary!.places.length > 0 && (
        <div className="mt-0.5 text-[11px] text-muted-foreground leading-tight line-clamp-2">
          {summary!.places.map((p, idx) => (
            <span key={p.name}>
              {idx > 0 && <span className="mx-1">·</span>}
              {p.name} <span className="font-mono text-foreground/80">{fmtDur(p.minutes)}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
