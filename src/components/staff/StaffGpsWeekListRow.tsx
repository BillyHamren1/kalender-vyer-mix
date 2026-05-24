import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { StaffGpsWeekDaySummary } from '@/hooks/staff/useStaffGpsWeekSummaryBatch';
import type { StaffMember } from '@/services/staffService';

interface Props {
  staff: StaffMember;
  weekDays: Date[];
  isAssigned: boolean;
  isPinged: boolean;
  /** Per-dag summary (dateKey 'yyyy-MM-dd' → summary). Saknad nyckel = ingen data. */
  summariesByDate: Record<string, StaffGpsWeekDaySummary>;
  isLoading: boolean;
  onSelect: (staffId: string, date: Date) => void;
}

function fmtDur(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function StaffGpsWeekListRow({
  staff, weekDays, summariesByDate, isLoading, onSelect,
}: Props) {
  // Hitta första dagen med aktivitet (för klick på namnet).
  const firstActiveIdx = weekDays.findIndex((d) => {
    const s = summariesByDate[format(d, 'yyyy-MM-dd')];
    return !!s && !!s.firstIso;
  });
  const defaultDate = firstActiveIdx >= 0 ? weekDays[firstActiveIdx] : weekDays[0];

  return (
    <div className="rounded-xl border border-[hsl(270_20%_90%)] bg-white overflow-hidden shadow-sm">
      {/* Person-header */}
      <button
        type="button"
        onClick={() => onSelect(staff.id, defaultDate)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[hsl(270_35%_98%)] border-b border-[hsl(270_20%_92%)] hover:bg-[hsl(270_45%_96%)] transition text-left"
      >
        <span className="text-[13px] font-semibold text-[hsl(280_45%_22%)] truncate">{staff.name}</span>
        <span className="ml-auto text-[10.5px] text-muted-foreground">Klicka för karta</span>
      </button>

      {/* 7-dagars rad */}
      <div className="grid grid-cols-7 divide-x divide-[hsl(270_18%_94%)]">
        {weekDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const summary = summariesByDate[key];
          const hasData = !!summary && summary.pingsCount > 0;
          const hasRange = hasData && !!summary!.firstIso && !!summary!.lastIso;
          const weekday = format(day, 'EEE', { locale: sv });
          const dayMonth = format(day, 'd/M', { locale: sv });

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(staff.id, day)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-1.5 py-2 text-center transition-all min-w-0',
                'hover:bg-[hsl(270_35%_97%)]',
              )}
            >
              <div className="flex items-baseline gap-1 leading-tight">
                <span
                  className={cn(
                    'text-[12px] font-semibold capitalize tracking-tight',
                    !hasData && 'text-muted-foreground/70',
                  )}
                >
                  {weekday}
                </span>
                <span
                  className={cn(
                    'text-[10.5px] tabular-nums',
                    hasData ? 'text-muted-foreground' : 'text-muted-foreground/50',
                  )}
                >
                  {dayMonth}
                </span>
              </div>
              {hasRange ? (
                <>
                  <span className="text-[12.5px] font-semibold tabular-nums text-foreground tracking-tight leading-tight">
                    {fmtDur(summary!.durationMin)}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/70 leading-tight">
                    {formatStockholmHm(summary!.firstIso!)}
                    <span className="mx-0.5 text-muted-foreground/40">–</span>
                    {formatStockholmHm(summary!.lastIso!)}
                  </span>
                </>
              ) : (
                <span className="text-[10.5px] text-muted-foreground/60 leading-tight">
                  {isLoading && !summary ? 'Laddar…' : hasData ? 'Endast hemma' : '—'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
