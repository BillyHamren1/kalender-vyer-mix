import React, { useEffect, useState } from 'react';
import { Sun } from 'lucide-react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * WorkDayHeaderTimer — small, calm pill in the header showing how long
 * the current workday has been running.
 *
 * SOURCE OF TRUTH: `useWorkDay()` → `workdays` table (server, realtime).
 * The workday is the PRIMARY signal; activity timers (project/travel/
 * warehouse/location) are SECONDARY segments. This component MUST NOT
 * derive its state from active timers or localStorage.
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
  const [, setTick] = useState(0);

  const startIso = current && !current.ended_at ? current.started_at : null;

  // Tick once per second only when a workday is open.
  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  if (!startIso) return null;

  const elapsedSeconds = Math.max(
    0,
    differenceInSeconds(new Date(), parseISO(startIso)),
  );

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-foreground/10 border border-primary-foreground/15"
      title={t('workday.lengthTitle')}
      aria-label={t('workday.todayTime')}
    >
      <Sun className="w-3 h-3 text-primary-foreground/80" />
      <span className="font-mono font-semibold text-[11px] tabular-nums text-primary-foreground leading-none">
        {formatHMS(elapsedSeconds)}
      </span>
    </div>
  );
};

export default WorkDayHeaderTimer;
