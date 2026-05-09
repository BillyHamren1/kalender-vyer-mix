import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { startOfWeek, addDays, isSameDay, format, startOfDay } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  consolidateShifts,
  getItemEnd,
  isItemActive,
  type MobileCalendarItem,
} from '@/lib/mobileCalendarConsolidation';
import { extractUTCTime, parsePlannerDateTime } from '@/utils/dateUtils';

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onOpenDayView?: (d: Date) => void;
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
}

const START_HOUR = 6;
const END_HOUR = 22;
const PX_PER_HOUR = 30;
const PX_PER_MIN = PX_PER_HOUR / 60;
const TIME_GUTTER_PX = 36;

const eventTypeStyles: Record<ScheduledShift['event_type'], string> = {
  rig: 'bg-planning-rig/85 text-planning-rig-foreground border-planning-rig-border',
  event: 'bg-planning-event/85 text-planning-event-foreground border-planning-event-border',
  rigdown: 'bg-planning-rigdown/85 text-planning-rigdown-foreground border-planning-rigdown-border',
  other: 'bg-muted text-foreground border-border',
};

const itemStartStr = (it: MobileCalendarItem) =>
  it.kind === 'booking' ? it.shift.start_time : it.start_time;

interface Positioned {
  item: MobileCalendarItem;
  topPx: number;
  heightPx: number;
  col: number;
  cols: number;
}

function layoutDay(items: MobileCalendarItem[], dayStart: Date, dayEnd: Date): Positioned[] {
  const sorted = [...items].sort(
    (a, b) =>
      (parsePlannerDateTime(itemStartStr(a))?.getTime() ?? 0) -
      (parsePlannerDateTime(itemStartStr(b))?.getTime() ?? 0),
  );
  const result: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = 0;
  const flush = () => {
    if (!cluster.length) return;
    const cols = Math.max(...cluster.map((p) => p.col)) + 1;
    cluster.forEach((p) => (p.cols = cols));
    result.push(...cluster);
    cluster = [];
    clusterEnd = 0;
  };
  for (const it of sorted) {
    const sd = parsePlannerDateTime(itemStartStr(it));
    const ed = parsePlannerDateTime(getItemEnd(it));
    if (!sd || !ed) continue;
    const startMs = Math.max(sd.getTime(), dayStart.getTime());
    const endMs = Math.min(ed.getTime(), dayEnd.getTime());
    if (endMs <= startMs) continue;
    const topPx = ((startMs - dayStart.getTime()) / 60000) * PX_PER_MIN;
    const heightPx = Math.max(((endMs - startMs) / 60000) * PX_PER_MIN, 14);
    if (startMs >= clusterEnd && cluster.length > 0) flush();
    const used = new Set(
      cluster
        .filter((p) => (parsePlannerDateTime(getItemEnd(p.item))?.getTime() ?? 0) > startMs)
        .map((p) => p.col),
    );
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ item: it, topPx, heightPx, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, endMs);
  }
  flush();
  return result;
}

const MobileWeekGrid = ({
  selectedDate,
  onSelectDate,
  onOpenDayView,
  shifts,
  activeBookingIds,
}: Props) => {
  const navigate = useNavigate();
  const { locale } = useLanguage();
  const dfLocale = locale === 'en' ? enUS : sv;
  const today = new Date();

  const weekStart = useMemo(
    () => startOfWeek(selectedDate, { weekStartsOn: 1 }),
    [selectedDate],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Auto-extend window if any shift this week falls outside default hours.
  const { startHour, endHour } = useMemo(() => {
    let s = START_HOUR;
    let e = END_HOUR;
    for (const sh of shifts) {
      const sd = parsePlannerDateTime(sh.start_time);
      const ed = parsePlannerDateTime(sh.end_time);
      if (!sd || !ed) continue;
      if (sd >= weekStart && sd < addDays(weekStart, 7)) {
        s = Math.min(s, sd.getHours());
        e = Math.max(e, ed.getHours() + (ed.getMinutes() > 0 ? 1 : 0));
      }
    }
    return { startHour: s, endHour: e };
  }, [shifts, weekStart]);

  const totalHours = endHour - startHour;
  const totalHeight = totalHours * PX_PER_HOUR;
  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  // Layout per day.
  const dayLayouts = useMemo(() => {
    return days.map((d) => {
      const dayStart = new Date(startOfDay(d));
      dayStart.setHours(startHour, 0, 0, 0);
      const dayEnd = new Date(startOfDay(d));
      dayEnd.setHours(endHour, 0, 0, 0);
      const todays = shifts.filter((s) => {
        const sd = parsePlannerDateTime(s.start_time);
        return sd && sd.toDateString() === d.toDateString();
      });
      const items = consolidateShifts(todays);
      return { day: d, dayStart, dayEnd, positioned: layoutDay(items, dayStart, dayEnd) };
    });
  }, [days, shifts, startHour, endHour]);

  const nowTopPx = useMemo(() => {
    const dayStart = new Date(startOfDay(today));
    dayStart.setHours(startHour, 0, 0, 0);
    return ((today.getTime() - dayStart.getTime()) / 60000) * PX_PER_MIN;
  }, [today, startHour]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
      <div className="min-w-[720px]">
      {/* Sticky day header */}
      <div className="sticky top-0 z-30 bg-card border-b border-border/60 flex">
        <div style={{ width: TIME_GUTTER_PX }} className="shrink-0" />
        <div className="flex-1 grid grid-cols-7">
          {days.map((d) => {
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  if (isSelected && onOpenDayView) onOpenDayView(d);
                  else onSelectDate(d);
                }}
                className={cn(
                  'flex flex-col items-center py-1.5 border-l border-border/40 first:border-l-0 transition-colors active:opacity-70',
                  isSelected && 'bg-primary/10',
                )}
              >
                <span
                  className={cn(
                    'text-[9px] uppercase tracking-wider font-semibold',
                    isSelected ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {format(d, 'EEEEE', { locale: dfLocale })}
                </span>
                <span
                  className={cn(
                    'mt-0.5 text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full',
                    isSelected && 'bg-primary text-primary-foreground',
                    !isSelected && isToday && 'ring-1 ring-primary text-primary',
                  )}
                >
                  {format(d, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid body */}
      <div className="relative flex" style={{ height: totalHeight }}>
        {/* Time gutter */}
        <div className="shrink-0 relative" style={{ width: TIME_GUTTER_PX }}>
          {hourLabels.map((h, i) => (
            <div
              key={h}
              className="absolute right-1 text-[9px] font-mono text-muted-foreground/60 -translate-y-1.5"
              style={{ top: i * PX_PER_HOUR }}
            >
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* 7 day columns */}
        <div className="flex-1 relative grid grid-cols-7">
          {/* Hour grid lines */}
          <div className="absolute inset-0 pointer-events-none">
            {hourLabels.map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-border/40"
                style={{ top: i * PX_PER_HOUR }}
              />
            ))}
          </div>

          {dayLayouts.map(({ day, positioned }) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'relative border-l border-border/40 first:border-l-0',
                  isSelected && 'bg-primary/5',
                  isToday && !isSelected && 'bg-accent/20',
                )}
              >
                {/* Now line */}
                {isToday && nowTopPx >= 0 && nowTopPx <= totalHeight && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowTopPx }}
                  >
                    <div className="h-px bg-destructive" />
                  </div>
                )}

                {positioned.map(({ item, topPx, heightPx, col, cols }) => {
                  const widthPct = 100 / cols;
                  const leftPct = col * widthPct;
                  const isActive = isItemActive(item, activeBookingIds);
                  const isProject = item.kind === 'project';
                  const startStr = isProject ? item.start_time : item.shift.start_time;
                  const eventType = isProject ? item.event_type : item.shift.event_type;
                  const title = isProject ? item.title : item.shift.client;
                  const handleClick = () => {
                    if (isProject) navigate(`/m/project/${item.largeProjectId}`);
                    else navigate(`/m/job/${item.shift.booking_id}`);
                  };
                  return (
                    <button
                      key={item.key}
                      onClick={handleClick}
                      className={cn(
                        'absolute rounded-sm border text-left overflow-hidden px-1 py-0.5 active:scale-[0.98] transition-all',
                        eventTypeStyles[eventType],
                        isActive && 'ring-1 ring-primary',
                      )}
                      style={{
                        top: topPx,
                        height: heightPx,
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                      }}
                    >
                      <div className="text-[9px] font-mono opacity-75 leading-none">
                        {extractUTCTime(startStr)}
                      </div>
                      <div className="text-[10px] font-semibold leading-tight truncate mt-0.5">
                        {title}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
};

export default MobileWeekGrid;
