import React, { useEffect, useMemo, useState } from 'react';
import { Sun, AlertTriangle } from 'lucide-react';
import { differenceInSeconds, parseISO, isSameDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

/**
 * WorkDayHeaderTimer — small, calm pill in the header showing how long
 * the current workday has been running.
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer = HUVUDSPÅR. Den här pillen visar dagens längd och inget
 *      annat. Den startas av manuell "Starta dagen" eller riktig
 *      geofence/start-action via useTimerStartFlow — aldrig av app-open.
 *   2. Aktivitetstid = INUTI dagen. Att starta/stoppa en aktivitet
 *      påverkar inte att dagen finns och visas inte här.
 *   3. "Avsluta dagen" = SEPARAT handling. Pillen försvinner först när
 *      workdays-raden faktiskt är ended_at (server-bekräftad).
 *   4. Geofence = SIGNAL — inget UI-state hämtas från geofence här.
 *
 * SOURCE OF TRUTH: `useWorkDay()` → `workdays` table (server, realtime).
 * Komponenten MÅSTE inte härleda state från aktiva timers eller
 * localStorage.
 *
 * Stale visualisation:
 *   - elapsed > 12h  → orange (warning)
 *   - started on a previous calendar day OR elapsed > 18h → red (critical)
 *   - clicking a stale pill navigates to /m/report so the user can correct
 *     the day instead of silently letting the timer run forever.
 */
const formatHMS = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const WorkDayHeaderTimer: React.FC = () => {
  const { current } = useWorkDay();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  const startIso = current && !current.ended_at ? current.started_at : null;

  // Tick once per second only when a workday is open.
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  const { elapsedSeconds, severity } = useMemo(() => {
    if (!startIso) return { elapsedSeconds: 0, severity: 'normal' as const };
    const startDate = parseISO(startIso);
    const now = new Date();
    const elapsed = Math.max(0, differenceInSeconds(now, startDate));
    const hours = elapsed / 3600;
    const previousDay = !isSameDay(now, startDate);
    if (previousDay || hours > 18) {
      return { elapsedSeconds: elapsed, severity: 'critical' as const };
    }
    if (hours > 12) {
      return { elapsedSeconds: elapsed, severity: 'warning' as const };
    }
    return { elapsedSeconds: elapsed, severity: 'normal' as const };
  }, [startIso]);

  if (!startIso) return null;

  const isStale = severity !== 'normal';

  const baseClasses = 'flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-2xl border-2 transition-colors shadow-sm';
  const stateClasses =
    severity === 'critical'
      ? 'bg-destructive/15 border-destructive/50 text-primary-foreground animate-pulse'
      : severity === 'warning'
        ? 'bg-warning/15 border-warning/50 text-primary-foreground'
        : 'bg-primary-foreground/14 border-primary-foreground/30 text-primary-foreground';

  const title = isStale
    ? 'Arbetsdagen är ovanligt lång — tryck för att kontrollera tidrapporten'
    : t('workday.lengthTitle');

  const Icon = isStale ? AlertTriangle : Sun;

  const content = (
    <>
      <Icon
        className={cn(
          'w-4 h-4',
          severity === 'critical'
            ? 'text-destructive'
            : severity === 'warning'
              ? 'text-warning'
              : 'text-primary-foreground/80',
        )}
      />
      <span className="font-mono font-extrabold text-base tabular-nums leading-none tracking-tight">
        {formatHMS(elapsedSeconds)}
      </span>
    </>
  );

  if (isStale) {
    return (
      <button
        type="button"
        onClick={() => navigate('/m/report')}
        className={cn(baseClasses, stateClasses, 'cursor-pointer hover:opacity-90')}
        title={title}
        aria-label={title}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(baseClasses, stateClasses)}
      title={title}
      aria-label={t('workday.todayTime')}
    >
      {content}
    </div>
  );
};

export default WorkDayHeaderTimer;
