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
 * SOURCE OF TRUTH: `useWorkDay()` → `workdays` table (server, realtime).
 * The workday is the PRIMARY signal; activity timers (project/travel/
 * warehouse/location) are SECONDARY segments. This component MUST NOT
 * derive its state from active timers or localStorage.
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

  const baseClasses = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors';
  const stateClasses =
    severity === 'critical'
      ? 'bg-destructive/20 border-destructive/40 text-destructive-foreground animate-pulse'
      : severity === 'warning'
        ? 'bg-warning/20 border-warning/40 text-warning-foreground'
        : 'bg-primary-foreground/10 border-primary-foreground/15 text-primary-foreground';

  const title = isStale
    ? 'Arbetsdagen är ovanligt lång — tryck för att kontrollera tidrapporten'
    : t('workday.lengthTitle');

  const Icon = isStale ? AlertTriangle : Sun;

  const content = (
    <>
      <Icon
        className={cn(
          'w-3 h-3',
          severity === 'critical'
            ? 'text-destructive'
            : severity === 'warning'
              ? 'text-warning'
              : 'text-primary-foreground/80',
        )}
      />
      <span className="font-mono font-semibold text-[11px] tabular-nums leading-none">
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
