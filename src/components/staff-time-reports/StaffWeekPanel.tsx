import { useMemo, useState } from 'react';
import { addDays, format, startOfISOWeek, getISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useStaffWeekReports, type WeekDayEntry } from '@/hooks/useStaffWeekReports';
import { formatHoursMinutes } from '@/utils/formatHours';
import type { PresenceRow } from './presenceUtils';
import { AiDayBanner } from './AiDayBanner';

interface Props {
  person: PresenceRow;
}

const PROJECT_COLORS = [
  'hsl(var(--primary))',
  'hsl(220 70% 55%)',
  'hsl(160 60% 45%)',
  'hsl(280 60% 55%)',
  'hsl(35 85% 55%)',
  'hsl(0 70% 55%)',
];

export const StaffWeekPanel = ({ person }: Props) => {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfISOWeek(new Date()));
  const { data, isLoading } = useStaffWeekReports(person.staff_id, weekStart);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const isoWeek = getISOWeek(weekStart);
  const weekLabel = `v.${isoWeek} ${format(weekStart, 'yyyy')}`;

  const days = data?.days || [];
  const totalHours = data?.totalHours || 0;
  const maxHours = useMemo(() => Math.max(8, ...days.map((d) => d.totalHours)), [days]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="text-base font-semibold text-foreground">{person.name}</div>
          <div className="text-xs text-muted-foreground">{person.role || '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Vecka totalt</div>
          <div className="text-base font-mono font-semibold tabular-nums">
            {formatHoursMinutes(totalHours)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, -7))}
          aria-label="Föregående vecka"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-sm font-medium">{weekLabel}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          aria-label="Nästa vecka"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {isLoading && <div className="text-sm text-muted-foreground p-3">Laddar…</div>}
        {!isLoading && days.every((d) => d.totalHours === 0) && (
          <div className="text-sm text-muted-foreground p-3">Inga rapporter denna vecka.</div>
        )}
        {!isLoading &&
          days.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              staffId={person.staff_id}
              maxHours={maxHours}
              expanded={openDay === day.date}
              onToggle={() => setOpenDay((c) => (c === day.date ? null : day.date))}
            />
          ))}
      </div>
    </div>
  );
};

interface DayRowProps {
  day: WeekDayEntry;
  staffId: string;
  maxHours: number;
  expanded: boolean;
  onToggle: () => void;
}

const DayRow = ({ day, staffId, maxHours, expanded, onToggle }: DayRowProps) => {
  const date = new Date(day.date + 'T00:00:00');
  const isToday = format(new Date(), 'yyyy-MM-dd') === day.date;
  const dayLabel = format(date, 'EEE d/M', { locale: sv });
  const pct = maxHours > 0 ? (day.totalHours / maxHours) * 100 : 0;
  const hasReports = day.totalHours > 0;

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-card/50 transition',
        isToday && 'border-primary/40',
      )}
    >
      <button
        type="button"
        onClick={hasReports ? onToggle : undefined}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          hasReports && 'hover:bg-accent/30',
        )}
      >
        <div className="w-5 text-muted-foreground">
          {hasReports ? (
            expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />
          ) : null}
        </div>
        <div className="w-24 text-sm font-medium capitalize">{dayLabel}</div>
        <div className="flex-1 min-w-0">
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            {day.projects.length === 0 ? (
              <div className="h-full" style={{ width: `${pct}%` }} />
            ) : (
              day.projects.map((p, idx) => {
                const segPct =
                  day.totalHours > 0 ? (p.hours / day.totalHours) * pct : 0;
                return (
                  <div
                    key={(p.booking_id || p.large_project_id || p.location_id || p.label) + idx}
                    className="h-full"
                    style={{
                      width: `${segPct}%`,
                      background: p.color || PROJECT_COLORS[idx % PROJECT_COLORS.length],
                    }}
                    title={`${p.label} · ${formatHoursMinutes(p.hours)}`}
                  />
                );
              })
            )}
          </div>
        </div>
        <div className="w-20 text-right font-mono text-sm tabular-nums">
          {hasReports ? formatHoursMinutes(day.totalHours) : '—'}
        </div>
        {day.hasOpen && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            pågående
          </Badge>
        )}
      </button>
      {expanded && hasReports && (
        <div className="px-3 pb-3 pl-12 space-y-2">
          <AiDayBanner staffId={staffId} date={day.date} />
          {day.projects.map((p, idx) => (
            <div
              key={(p.booking_id || p.large_project_id || p.location_id || p.label) + idx}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: p.color || PROJECT_COLORS[idx % PROJECT_COLORS.length] }}
              />
              <span className="flex-1 truncate text-foreground/90">{p.label}</span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatHoursMinutes(p.hours)}
              </span>
            </div>
          ))}
          <div className="pt-1">
            <Link
              to={`/staff-management/time-reports/${staffId}/${day.date}`}
              className="text-xs text-primary hover:underline"
            >
              Öppna dagsvy →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffWeekPanel;
