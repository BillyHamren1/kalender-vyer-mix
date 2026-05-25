import { useMemo } from 'react';
import { startOfWeek, addDays, isSameDay, isAfter, isBefore, format, startOfDay } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  consolidateShifts,
  getItemEnd,
  isItemActive,
  type MobileCalendarItem,
} from '@/lib/mobileCalendarConsolidation';
import { parsePlannerDateTime, extractUTCTime } from '@/utils/dateUtils';

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
  /** Optional — when provided, tapping a day card opens day view. */
  onOpenDayView?: (d: Date) => void;
}

const itemStart = (it: MobileCalendarItem) =>
  it.kind === 'booking' ? it.shift.start_time : it.start_time;

const itemTitle = (it: MobileCalendarItem) =>
  it.kind === 'booking' ? (it.shift.client || it.shift.large_project_name || 'Job') : it.title;

interface DaySummary {
  date: Date;
  items: MobileCalendarItem[];
  totalMinutes: number;
  hasActive: boolean;
}

function summarizeDay(date: Date, shifts: ScheduledShift[], activeIds: Set<string>): DaySummary {
  const todays = shifts.filter((s) => {
    const sd = parsePlannerDateTime(s.start_time);
    return sd && isSameDay(sd, date);
  });
  const items = consolidateShifts(todays);
  let totalMinutes = 0;
  for (const it of items) {
    const sd = parsePlannerDateTime(itemStart(it));
    const ed = parsePlannerDateTime(getItemEnd(it));
    if (!sd || !ed) continue;
    totalMinutes += Math.max(0, Math.round((ed.getTime() - sd.getTime()) / 60000));
  }
  const hasActive = items.some((it) => isItemActive(it, activeIds));
  return { date, items, totalMinutes, hasActive };
}

function formatHm(mins: number): string {
  if (mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const MobileWeekView = ({
  selectedDate,
  onSelectDate,
  shifts,
  activeBookingIds,
  onOpenDayView,
}: Props) => {
  const { locale, t } = useLanguage();
  const dfLocale = locale === 'en' ? enUS : sv;
  const today = startOfDay(new Date());

  const weekStart = useMemo(
    () => startOfWeek(selectedDate, { weekStartsOn: 1 }),
    [selectedDate],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const summaries = useMemo(
    () => days.map((d) => summarizeDay(d, shifts, activeBookingIds)),
    [days, shifts, activeBookingIds],
  );

  const handleDayTap = (d: Date) => {
    const same = isSameDay(d, selectedDate);
    if (same && onOpenDayView) onOpenDayView(d);
    else onSelectDate(d);
  };

  return (
    <div className="space-y-3">
      {/* 7-day strip — all days visible, no horizontal scroll */}
      <div className="grid grid-cols-7 gap-1 px-0.5">
        {days.map((d) => {
          const isSelected = isSameDay(d, selectedDate);
          const isToday = isSameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => handleDayTap(d)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all active:scale-95',
                isSelected ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : 'bg-card hover:bg-muted/60',
              )}
            >
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wider font-semibold leading-none',
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {format(d, 'EEEEE', { locale: dfLocale })}
              </span>
              <span
                className={cn(
                  'text-sm font-bold leading-none mt-0.5',
                  !isSelected && isToday && 'text-primary',
                )}
              >
                {format(d, 'd')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Weekly day summary cards */}
      <div className="space-y-2">
        {summaries.map(({ date, items, totalMinutes, hasActive }) => {
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);
          const isPast = isBefore(date, today);
          const isFuture = isAfter(date, today);

          let status: { label: string; tone: string };
          if (items.length === 0) {
            status = { label: 'Ledig', tone: 'bg-muted text-muted-foreground' };
          } else if (hasActive) {
            status = { label: 'Pågår', tone: 'bg-primary/15 text-primary' };
          } else if (isFuture) {
            status = { label: 'Ej startad', tone: 'bg-muted text-foreground/70' };
          } else if (isPast) {
            status = { label: 'Klar', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
          } else {
            status = { label: 'Idag', tone: 'bg-primary/15 text-primary' };
          }

          const titles = items.map(itemTitle).filter(Boolean);
          const uniqueTitles = Array.from(new Set(titles));
          const summaryText = uniqueTitles.slice(0, 3).join(' · ');
          const moreCount = uniqueTitles.length - 3;
          const firstStart = items[0] ? extractUTCTime(itemStart(items[0])) : null;

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => handleDayTap(date)}
              className={cn(
                'w-full text-left rounded-xl border bg-card px-3 py-2.5 transition-all active:scale-[0.99]',
                isSelected ? 'border-primary/60 ring-1 ring-primary/40 shadow-sm' : 'border-border/60 hover:border-border',
                isToday && !isSelected && 'border-primary/30',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col items-center justify-center w-10 shrink-0">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground leading-none">
                      {format(date, 'EEE', { locale: dfLocale })}
                    </span>
                    <span className={cn('text-lg font-bold leading-none mt-0.5', isToday && 'text-primary')}>
                      {format(date, 'd')}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', status.tone)}>
                        {status.label}
                      </span>
                      {items.length > 0 && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {formatHm(totalMinutes)} · {items.length} {items.length === 1 ? (t('calendar.job') || 'jobb') : (t('calendar.jobs') || 'jobb')}
                        </span>
                      )}
                      {firstStart && (
                        <span className="text-[11px] font-mono text-muted-foreground/80">
                          {firstStart}
                        </span>
                      )}
                    </div>
                    {summaryText && (
                      <div className="mt-1 text-xs text-foreground/80 truncate">
                        {summaryText}
                        {moreCount > 0 && <span className="text-muted-foreground"> +{moreCount}</span>}
                      </div>
                    )}
                    {!summaryText && (
                      <div className="mt-1 text-xs text-muted-foreground/70 italic">
                        {t('calendar.noJobs') || 'Inga planerade jobb'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {hasActive && (
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden />
                  )}
                  {/* Placeholder for future "needs review" anomaly flag */}
                  {false && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileWeekView;
