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
  return `${h}h ${m}m`;
}

/**
 * Kompakt veckokalender-cell (horisontellt grid).
 * Använd istället för StaffGpsDayRow när dagarna visas som rad.
 */
export function StaffGpsDayCell({ day, dateStr, selected, summary, onClick }: Props) {
  const weekday = format(day, 'EEE', { locale: sv });
  const dayMonth = format(day, 'd/M', { locale: sv });
  const hasData = !!summary && summary.pingsCount > 0;
  const hasRange = hasData && summary!.firstIso && summary!.lastIso;

  return (
    <button
      type="button"
      data-date={dateStr}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-0.5 px-1.5 py-2 text-center transition-all border-b-[3px] min-w-0',
        selected
          ? 'border-[hsl(270_50%_55%)] bg-[hsl(270_45%_96%)]'
          : 'border-transparent hover:bg-[hsl(270_35%_97%)]',
      )}
    >
      <div className="flex items-baseline gap-1 leading-tight">
        <span className={cn(
          'text-[12px] font-semibold capitalize tracking-tight',
          !hasData && 'text-muted-foreground/70',
        )}>
          {weekday}
        </span>
        <span className={cn(
          'text-[10.5px] tabular-nums',
          hasData ? 'text-muted-foreground' : 'text-muted-foreground/50',
        )}>
          {dayMonth}
        </span>
      </div>
      {hasRange ? (
        <>
          <span className="text-[12.5px] font-semibold tabular-nums text-foreground tracking-tight leading-tight">
            {fmtDur(summary!.durationMin)}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground/70 leading-tight">
            {formatStockholmHm(summary!.firstIso!)}<span className="mx-0.5 text-muted-foreground/40">–</span>{formatStockholmHm(summary!.lastIso!)}
          </span>
        </>
      ) : (
        <span className="text-[10.5px] text-muted-foreground/60 leading-tight">
          {summary?.isLoading ? 'Laddar…' : hasData ? 'Endast hemma' : '—'}
        </span>
      )}
    </button>
  );
}
