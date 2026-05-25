import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin } from 'lucide-react';
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
        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-[hsl(280_45%_38%)]">
          <MapPin className="h-3 w-3" /> Visa karta
        </span>
      </button>

      {/* Vertikala dagsrader: Mån–Sön */}
      <div className="divide-y divide-[hsl(270_18%_94%)]">
        {weekDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const summary = summariesByDate[key];
          const hasData = !!summary && summary.pingsCount > 0;
          const hasRange = hasData && !!summary!.firstIso && !!summary!.lastIso;
          const weekday = format(day, 'EEE', { locale: sv });
          const dayMonth = format(day, 'd/M', { locale: sv });
          const places = summary?.placeNames ?? [];

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(staff.id, day)}
              className={cn(
                'w-full grid grid-cols-[88px_minmax(96px,140px)_1fr] items-center gap-3 px-3 py-2 text-left transition',
                'hover:bg-[hsl(270_35%_97%)]',
                !hasData && 'opacity-80',
              )}
            >
              {/* Dag-kolumn */}
              <div className="flex flex-col leading-tight min-w-0">
                <span
                  className={cn(
                    'text-[12.5px] font-semibold capitalize tracking-tight',
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

              {/* Tid-kolumn */}
              <div className="flex flex-col leading-tight min-w-0">
                {hasRange ? (
                  <>
                    <span className="text-[12.5px] font-semibold tabular-nums text-foreground tracking-tight">
                      {fmtDur(summary!.durationMin)}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground/70">
                      {formatStockholmHm(summary!.firstIso!)}
                      <span className="mx-0.5 text-muted-foreground/40">–</span>
                      {formatStockholmHm(summary!.lastIso!)}
                    </span>
                  </>
                ) : (
                  <span className="text-[10.5px] text-muted-foreground/60">
                    {isLoading && !summary ? 'Laddar…' : hasData ? 'Endast hemma' : '—'}
                  </span>
                )}
              </div>

              {/* Platser-kolumn (höger) */}
              <div className="flex flex-wrap gap-1 justify-end min-w-0">
                {places.length > 0 ? (
                  places.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center max-w-[220px] truncate rounded-full bg-[hsl(270_35%_96%)] border border-[hsl(270_20%_88%)] px-2 py-0.5 text-[10.5px] text-[hsl(280_45%_28%)]"
                      title={name}
                    >
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="text-[10.5px] text-muted-foreground/50">
                    {hasData ? 'Okänd plats' : ''}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
