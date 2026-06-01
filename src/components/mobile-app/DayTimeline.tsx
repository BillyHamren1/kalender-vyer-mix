import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScheduledShift } from '@/services/mobileApiService';
import { Calendar, MapPin, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageContext';
import { extractUTCTime, parsePlannerDateTime } from '@/utils/dateUtils';
import {
  consolidateShifts,
  getItemEnd,
  isItemActive,
  type MobileCalendarItem,
} from '@/lib/mobileCalendarConsolidation';
import TeamVehicleLine from '@/components/mobile-app/TeamVehicleLine';
import type { TeamVehicleInfo } from '@/lib/teamVehicles';

function itemVehicles(it: MobileCalendarItem): TeamVehicleInfo[] {
  const shifts = it.kind === 'project' ? it.shifts : [it.shift];
  const map = new Map<string, TeamVehicleInfo>();
  for (const s of shifts) {
    for (const v of s.team_vehicles ?? []) {
      if (!map.has(v.id)) map.set(v.id, v);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

interface DayTimelineProps {
  shifts: ScheduledShift[];
  /** Bookings/projects with an active timer — highlights the matching shift card. */
  activeBookingIds?: Set<string>;
  /** Date to render. Defaults to today. */
  date?: Date;
  /** 'compact' (default) shows whole day; 'detailed' uses larger PX_PER_HOUR + scroll-to-now. */
  density?: 'compact' | 'detailed';
}

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;
const PX_PER_HOUR_COMPACT = 24;
const PX_PER_HOUR_DETAILED = 40;


interface PositionedItem {
  item: MobileCalendarItem;
  topPx: number;
  heightPx: number;
  /** Column index within an overlap group. */
  col: number;
  /** Number of columns in the overlap group. */
  cols: number;
}

const itemStartStr = (it: MobileCalendarItem) =>
  it.kind === 'booking' ? it.shift.start_time : it.start_time;

/** Assigns column slots so overlapping items render side-by-side. */
function layoutItems(items: MobileCalendarItem[], dayStart: Date, dayEnd: Date, pxPerMinute: number): PositionedItem[] {
  const sorted = [...items].sort(
    (a, b) =>
      (parsePlannerDateTime(itemStartStr(a))?.getTime() ?? 0) -
      (parsePlannerDateTime(itemStartStr(b))?.getTime() ?? 0)
  );

  const positioned: PositionedItem[] = [];
  let cluster: PositionedItem[] = [];
  let clusterEnd = 0;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const cols = Math.max(...cluster.map((p) => p.col)) + 1;
    cluster.forEach((p) => (p.cols = cols));
    positioned.push(...cluster);
    cluster = [];
    clusterEnd = 0;
  };

  for (const it of sorted) {
    const startDate = parsePlannerDateTime(itemStartStr(it));
    const endDate = parsePlannerDateTime(getItemEnd(it));
    if (!startDate || !endDate) continue;

    const startMs = Math.max(startDate.getTime(), dayStart.getTime());
    const endMs = Math.min(endDate.getTime(), dayEnd.getTime());
    if (endMs <= startMs) continue;

    const topPx = ((startMs - dayStart.getTime()) / 60000) * pxPerMinute;
    const heightPx = Math.max(((endMs - startMs) / 60000) * pxPerMinute, 18);

    if (startMs >= clusterEnd && cluster.length > 0) {
      flushCluster();
    }

    const usedCols = new Set(
      cluster
        .filter((p) => (parsePlannerDateTime(getItemEnd(p.item))?.getTime() ?? 0) > startMs)
        .map((p) => p.col)
    );
    let col = 0;
    while (usedCols.has(col)) col++;

    cluster.push({ item: it, topPx, heightPx, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, endMs);
  }
  flushCluster();

  return positioned;
}

const eventTypeStyles: Record<ScheduledShift['event_type'], string> = {
  rig: 'bg-planning-rig text-planning-rig-foreground border-planning-rig-border',
  event: 'bg-planning-event text-planning-event-foreground border-planning-event-border',
  rigdown: 'bg-planning-rigdown text-planning-rigdown-foreground border-planning-rigdown-border',
  other: 'bg-muted text-foreground border-border',
};

type EventTypeKey = ScheduledShift['event_type'];
const eventTypeI18nKey: Record<EventTypeKey, 'dayTimeline.rig' | 'dayTimeline.event' | 'dayTimeline.rigdown' | 'dayTimeline.other'> = {
  rig: 'dayTimeline.rig',
  event: 'dayTimeline.event',
  rigdown: 'dayTimeline.rigdown',
  other: 'dayTimeline.other',
};

const DayTimeline = ({ shifts, activeBookingIds, date, density = 'compact' }: DayTimelineProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const today = date ?? new Date();
  const dayStartBase = startOfDay(today);
  const scrollRef = useRef<HTMLDivElement>(null);
  const PX_PER_HOUR = density === 'detailed' ? PX_PER_HOUR_DETAILED : PX_PER_HOUR_COMPACT;
  const PX_PER_MINUTE = PX_PER_HOUR / 60;
  const isCompact = density === 'compact';

  // Auto-extend window if shifts fall outside default 06–22.
  const { dayStart, dayEnd, totalHours } = useMemo(() => {
    let startHour = DEFAULT_START_HOUR;
    let endHour = DEFAULT_END_HOUR;
    for (const s of shifts) {
      const sd = parsePlannerDateTime(s.start_time);
      const ed = parsePlannerDateTime(s.end_time);
      if (!sd || !ed) continue;
      if (sd.toDateString() === today.toDateString()) {
        startHour = Math.min(startHour, sd.getHours());
      }
      if (ed.toDateString() === today.toDateString()) {
        endHour = Math.max(endHour, ed.getHours() + (ed.getMinutes() > 0 ? 1 : 0));
      }
    }
    const ds = new Date(dayStartBase);
    ds.setHours(startHour, 0, 0, 0);
    const de = new Date(dayStartBase);
    de.setHours(endHour, 0, 0, 0);
    return { dayStart: ds, dayEnd: de, totalHours: endHour - startHour };
  }, [shifts, today, dayStartBase]);

  const todaysShifts = useMemo(
    () =>
      shifts.filter((s) => {
        const d = parsePlannerDateTime(s.start_time);
        if (!d) return false;
        return d.toDateString() === today.toDateString();
      }),
    [shifts, today]
  );

  // Consolidate same-day large-project shifts into ONE card per project so
  // the calendar stays readable even for projects with many sub-bookings.
  const items = useMemo(() => consolidateShifts(todaysShifts), [todaysShifts]);

  const positioned = useMemo(
    () => layoutItems(items, dayStart, dayEnd, PX_PER_MINUTE),
    [items, dayStart, dayEnd, PX_PER_MINUTE]
  );

  // Now-line tick (per minute) + initial auto-scroll (detailed mode only).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isShowingToday = isToday(today);
  const nowTopPx = isShowingToday
    ? ((now.getTime() - dayStart.getTime()) / 60000) * PX_PER_MINUTE
    : -1;

  useEffect(() => {
    if (isCompact) return;
    if (!isShowingToday || !scrollRef.current) return;
    const container = scrollRef.current;
    const target = Math.max(nowTopPx - container.clientHeight / 3, 0);
    container.scrollTo({ top: target, behavior: 'auto' });
    // Only on mount — intentional empty deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (todaysShifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Calendar className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground/70">Inga planerade pass idag</p>
          <p className="text-xs text-muted-foreground mt-1">
            {format(today, 'EEEE d MMMM', { locale: sv })}
          </p>
        </div>
      </div>
    );
  }

  const totalHeight = totalHours * PX_PER_HOUR;
  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => {
    const h = new Date(dayStart);
    h.setHours(dayStart.getHours() + i);
    return h;
  });

  return (
    <div
      ref={scrollRef}
      className={isCompact ? '' : 'overflow-y-auto'}
      style={isCompact ? undefined : { maxHeight: 'calc(100vh - 220px)' }}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {/* Hour grid */}
        {hourLabels.map((h, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 flex items-start"
            style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
          >
            <div className="w-12 shrink-0 pr-2 text-right text-[10px] font-mono text-muted-foreground/60 -translate-y-1.5">
              {format(h, 'HH:mm')}
            </div>
            <div className="flex-1 border-t border-border/50 h-full" />
          </div>
        ))}

        {/* Now line */}
        {isShowingToday && nowTopPx >= 0 && nowTopPx <= totalHeight && (
          <div
            className="absolute left-12 right-2 z-20 pointer-events-none"
            style={{ top: nowTopPx }}
          >
            <div className="relative h-0.5 bg-destructive">
              <div className="absolute -left-1.5 -top-[5px] w-3 h-3 rounded-full bg-destructive shadow-md" />
            </div>
          </div>
        )}

        {/* Calendar cards (project = consolidated, booking = standalone) */}
        <div className="absolute left-12 right-2 top-0 bottom-0 z-10">
          {positioned.map(({ item, topPx, heightPx, col, cols }) => {
            const widthPct = 100 / cols;
            const leftPct = col * widthPct;
            const isActive = isItemActive(item, activeBookingIds);

            const isProject = item.kind === 'project';
            const startStr = isProject ? item.start_time : item.shift.start_time;
            const endStr = isProject ? item.end_time : item.shift.end_time;
            const eventType = isProject ? item.event_type : item.shift.event_type;
            const title = isProject ? item.title : item.shift.client;
            const address = isProject ? item.delivery_address : item.shift.delivery_address;
            const handleClick = () => {
              if (isProject) navigate(`/m/project/${item.largeProjectId}`);
              else navigate(`/m/job/${item.shift.booking_id}`);
            };

            return (
              <button
                key={item.key}
                onClick={handleClick}
                className={cn(
                  'absolute rounded-md border text-left shadow-sm active:scale-[0.98] transition-all overflow-hidden',
                  isCompact ? 'px-1.5 py-0.5' : 'px-2.5 py-1.5',
                  eventTypeStyles[eventType],
                  isActive && 'ring-2 ring-primary'
                )}
                style={{
                  top: topPx,
                  height: heightPx,
                  left: `calc(${leftPct}% + 2px)`,
                  width: `calc(${widthPct}% - 4px)`,
                }}
              >
                {isCompact ? (
                  <div className="flex items-center gap-1 leading-tight">
                    <span className="text-[9px] font-mono opacity-70 shrink-0">
                      {extractUTCTime(startStr)}
                    </span>
                    <span className="text-[10px] font-bold truncate">{title}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isProject ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-80">
                          <FolderOpen className="w-2.5 h-2.5" />
                          {t('project.fallback') || 'PROJEKT'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                          {t(eventTypeI18nKey[eventType])}
                        </span>
                      )}
                      <span className="text-[10px] font-mono opacity-70">
                        {extractUTCTime(startStr)}–{extractUTCTime(endStr)}
                      </span>
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <div className="text-[12px] font-bold leading-tight truncate">{title}</div>
                    {heightPx > 36 && address && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-75 truncate">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{address}</span>
                      </div>
                    )}
                    {isProject && heightPx > 48 && (
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {item.shifts.length} {item.shifts.length === 1 ? 'bokning' : 'bokningar'}
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DayTimeline;
