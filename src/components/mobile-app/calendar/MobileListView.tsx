import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, FolderOpen } from 'lucide-react';
import type { ScheduledShift } from '@/services/mobileApiService';
import { useLanguage } from '@/i18n/LanguageContext';
import { useShiftsByDate } from '@/hooks/useBookingsByDate';
import { consolidateShifts, isItemActive, type MobileCalendarItem } from '@/lib/mobileCalendarConsolidation';
import { extractUTCTime, parsePlannerDateTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';

interface Props {
  shifts: ScheduledShift[];
  activeBookingIds: Set<string>;
  /** Anchor date — list visar dagar från och med denna dag (default: idag). */
  fromDate?: Date;
}

const eventTypeStyles: Record<ScheduledShift['event_type'], string> = {
  rig: 'bg-planning-rig text-planning-rig-foreground border-planning-rig-border',
  event: 'bg-planning-event text-planning-event-foreground border-planning-event-border',
  rigdown: 'bg-planning-rigdown text-planning-rigdown-foreground border-planning-rigdown-border',
  other: 'bg-muted text-foreground border-border',
};

const eventTypeI18nKey = {
  rig: 'dayTimeline.rig',
  event: 'dayTimeline.event',
  rigdown: 'dayTimeline.rigdown',
  other: 'dayTimeline.other',
} as const;

const dayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDayHeader = (key: string, t: (k: any) => string): string => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const todayKey = dayKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (key === todayKey) return t('calendar.today') || 'Idag';
  if (key === dayKey(tomorrow)) return t('calendar.tomorrow') || 'Imorgon';
  return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
};

const MobileListView = ({ shifts, activeBookingIds, fromDate }: Props) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const grouped = useShiftsByDate(shifts);

  const days = useMemo(() => {
    const anchor = fromDate ? new Date(fromDate) : new Date();
    anchor.setHours(0, 0, 0, 0);
    const anchorKey = dayKey(anchor);
    const keys = Array.from(grouped.map.keys())
      .filter(k => k >= anchorKey)
      .sort();
    return keys.map(k => {
      const dayShifts = grouped.map.get(k) || [];
      const items = consolidateShifts(dayShifts).sort((a, b) => {
        const aStart = a.kind === 'project' ? a.start_time : a.shift.start_time;
        const bStart = b.kind === 'project' ? b.start_time : b.shift.start_time;
        const aTs = parsePlannerDateTime(aStart)?.getTime() ?? 0;
        const bTs = parsePlannerDateTime(bStart)?.getTime() ?? 0;
        return aTs - bTs;
      });
      return { key: k, items };
    });
  }, [grouped, fromDate]);

  if (days.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Calendar className="w-6 h-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-semibold text-foreground/70">
          {t('calendar.noJobsUpcoming') || 'Inga kommande pass'}
        </p>
      </div>
    );
  }

  const handleClick = (item: MobileCalendarItem) => {
    if (item.kind === 'project') navigate(`/m/project/${item.largeProjectId}`);
    else navigate(`/m/job/${item.shift.booking_id}`);
  };

  return (
    <div className="space-y-4">
      {days.map(({ key, items }) => (
        <div key={key} className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
            {formatDayHeader(key, t)}
          </h3>
          <div className="space-y-2">
            {items.map(item => {
              const isProject = item.kind === 'project';
              const startStr = isProject ? item.start_time : item.shift.start_time;
              const endStr = isProject ? item.end_time : item.shift.end_time;
              const eventType = isProject ? item.event_type : item.shift.event_type;
              const title = isProject ? item.title : item.shift.client;
              const address = isProject ? item.delivery_address : item.shift.delivery_address;
              const active = isItemActive(item, activeBookingIds);

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleClick(item)}
                  className={cn(
                    'w-full text-left rounded-xl border px-3 py-2.5 shadow-sm active:scale-[0.99] transition-all',
                    eventTypeStyles[eventType],
                    active && 'ring-2 ring-primary'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {isProject ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
                        <FolderOpen className="w-3 h-3" />
                        {t('project.fallback') || 'PROJEKT'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                        {t(eventTypeI18nKey[eventType])}
                      </span>
                    )}
                    <span className="text-[11px] font-mono opacity-75 ml-auto">
                      {extractUTCTime(startStr)}–{extractUTCTime(endStr)}
                    </span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                  <div className="text-[13px] font-bold leading-tight">{title}</div>
                  {address && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] opacity-75">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{address}</span>
                    </div>
                  )}
                  {isProject && (
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {item.shifts.length} {item.shifts.length === 1 ? 'bokning' : 'bokningar'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MobileListView;
