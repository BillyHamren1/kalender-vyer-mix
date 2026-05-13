// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
import React, { useEffect, useMemo, useState } from 'react';
import { Sun, AlertTriangle, Activity, Pause } from 'lucide-react';
import { differenceInSeconds, parseISO, isSameDay, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useLanguage } from '@/i18n/LanguageContext';
import { useGeofencingContextOptional } from '@/contexts/GeofencingContext';
import { useActiveDayState } from '@/hooks/useActiveDayState';
import { cn } from '@/lib/utils';

/**
 * WorkDayHeaderTimer — prominent multi-line indicator showing that the
 * workday is running, when it started, how long it has been going, and
 * which activity (if any) is currently being timed inside the day.
 *
 * UNIFIED MODEL:
 *   • Dagtimer = HUVUDSPÅR (denna komponent visar dagens längd)
 *   • Aktivitetstid = INUTI dagen (visas som sekundär rad)
 *   • Workday-state hämtas från `useWorkDay()` (server-truth)
 *   • Aktiv aktivitet hämtas från GeofencingContext.activeTimers
 *
 * Stale-visualisering:
 *   - elapsed > 12h  → orange (warning)
 *   - elapsed > 18h eller startad föregående dag → röd (critical, klickbar)
 */
const formatHMS = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const getActivityLabel = (timer: {
  locationName?: string;
  client?: string;
  establishmentTaskTitle?: string;
  largeProjectId?: string;
}): string => {
  return (
    timer.establishmentTaskTitle ||
    timer.locationName ||
    timer.client ||
    'Aktivitet'
  );
};

export const WorkDayHeaderTimer: React.FC = () => {
  const { current } = useWorkDay();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const geo = useGeofencingContextOptional();
  const [, setTick] = useState(0);

  const startIso = current && !current.ended_at ? current.started_at : null;

  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const { elapsedSeconds, severity, startTimeLabel } = useMemo(() => {
    if (!startIso) {
      return { elapsedSeconds: 0, severity: 'normal' as const, startTimeLabel: '' };
    }
    const startDate = parseISO(startIso);
    const now = new Date();
    const elapsed = Math.max(0, differenceInSeconds(now, startDate));
    const hours = elapsed / 3600;
    const previousDay = !isSameDay(now, startDate);
    const sev =
      previousDay || hours > 18
        ? ('critical' as const)
        : hours > 12
          ? ('warning' as const)
          : ('normal' as const);
    return {
      elapsedSeconds: elapsed,
      severity: sev,
      startTimeLabel: format(startDate, 'HH:mm'),
    };
  }, [startIso]);

  // Server-state är sanning. Om lokal activeTimers saknar rad men servern
  // har en öppen entry — visa den. På så sätt syns aktiviteten alltid i
  // headern oavsett localStorage.
  const { state: activeDayState } = useActiveDayState();

  const activeTimer = useMemo(() => {
    if (geo?.activeTimers && geo.activeTimers.size > 0) {
      const first = geo.activeTimers.values().next().value as
        | {
            locationName?: string;
            client?: string;
            establishmentTaskTitle?: string;
            largeProjectId?: string;
          }
        | undefined;
      if (first) return first;
    }
    const serverEntry = activeDayState?.open_entries?.[0];
    if (serverEntry) {
      return { locationName: serverEntry.target_label } as { locationName?: string };
    }
    return null;
  }, [geo?.activeTimers, activeDayState?.open_entries]);

  if (!startIso) return null;

  const isStale = severity !== 'normal';
  const Icon = isStale ? AlertTriangle : Sun;

  const containerClasses = cn(
    'flex flex-col items-stretch gap-0.5 min-w-[180px] px-3 py-1.5 rounded-2xl border-2 shadow-sm transition-colors text-left',
    severity === 'critical'
      ? 'bg-destructive/15 border-destructive/60 text-primary-foreground animate-pulse'
      : severity === 'warning'
        ? 'bg-warning/20 border-warning/60 text-primary-foreground'
        : 'bg-primary-foreground/15 border-primary-foreground/40 text-primary-foreground',
  );

  const title = isStale
    ? 'Arbetsdagen är ovanligt lång — tryck för att kontrollera tidrapporten'
    : t('workday.lengthTitle');

  const inner = (
    <>
      {/* Top row: status label + live duration */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon
            className={cn(
              'w-3.5 h-3.5 shrink-0',
              severity === 'critical'
                ? 'text-destructive'
                : severity === 'warning'
                  ? 'text-warning'
                  : 'text-primary-foreground/90',
            )}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wide leading-none truncate">
            Arbetsdag pågår
          </span>
        </div>
        <span className="font-mono font-extrabold text-sm tabular-nums leading-none tracking-tight">
          {formatHMS(elapsedSeconds)}
        </span>
      </div>

      {/* Middle row: started at */}
      <div className="text-[10px] leading-tight opacity-80">
        Startad {startTimeLabel} · Tid idag
      </div>

      {/* Bottom row: where time is being registered right now */}
      <div className="flex items-center gap-1 pt-1 mt-1 border-t border-current/20">
        {activeTimer ? (
          <>
            <Activity className="w-3 h-3 shrink-0 text-primary-foreground/90" />
            <span className="text-[11px] font-medium truncate">
              Tid registreras: {getActivityLabel(activeTimer)}
            </span>
          </>
        ) : (
          <>
            <Pause className="w-3 h-3 shrink-0 opacity-70" />
            <span className="text-[11px] font-medium opacity-80 truncate">
              Ej fördelat — välj projekt eller plats
            </span>
          </>
        )}
      </div>
    </>
  );

  if (isStale) {
    return (
      <button
        type="button"
        onClick={() => navigate('/m/report')}
        className={cn(containerClasses, 'cursor-pointer hover:opacity-90')}
        title={title}
        aria-label={title}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={containerClasses}
      title={title}
      aria-label={t('workday.todayTime')}
    >
      {inner}
    </div>
  );
};

export default WorkDayHeaderTimer;
