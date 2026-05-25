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

export function StaffGpsDayRow({ day, dateStr, selected, summary, staffId, staffName, onClick }: Props) {
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
      {hasData && summary!.places.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {summary!.places.map((p) => (
            <li
              key={p.name}
              className="flex items-baseline justify-between gap-3 text-[11.5px] leading-snug"
            >
              <span className="flex items-baseline gap-1.5 min-w-0">
                <span className="inline-block h-1 w-1 rounded-full bg-primary/60 shrink-0 translate-y-[-2px]" />
                <span className="truncate text-foreground/80">{p.name}</span>
              </span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {fmtDur(p.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
