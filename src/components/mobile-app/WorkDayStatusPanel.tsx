import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sun, Play, LogOut, Loader2, Activity, CheckCircle2 } from 'lucide-react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useLocation } from 'react-router-dom';
import { clearWorkdayEnded } from '@/services/workdayState';
import { extractUTCTime } from '@/utils/dateUtils';
import { toast } from 'sonner';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { cn } from '@/lib/utils';

const TIMERS_KEY = 'eventflow-mobile-timers';

/**
 * WorkDayStatusPanel
 *
 * Single, always-visible status block at the top of the mobile shell that
 * answers ONE question for the user at any given time:
 *   "Is my workday running, and how long?"
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer (workday) is the PRIMARY signal — its tick comes straight
 *      from `useWorkDay().current.started_at`.
 *   2. Activity (project/location/booking timer) is shown SEPARATELY in a
 *      secondary row so the two clocks are never visually confused.
 *   3. The "Starta dagen" / "Avsluta dagen" buttons live HERE, not in the
 *      bottom timer banner — the banner is for activity rows only.
 *   4. After a successful end-day we briefly (~8s) display a confirmation
 *      card with the total duration, then collapse to idle.
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

const formatStartTime = (iso: string): string => {
  try {
    return extractUTCTime(iso);
  } catch {
    return iso.slice(11, 16);
  }
};

const loadTimers = (): Map<string, ActiveTimer> => {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    return new Map(raw ? JSON.parse(raw) : []);
  } catch {
    return new Map();
  }
};

const pickActivityFromTimers = (timers: Map<string, ActiveTimer>): { name: string; startIso: string } | null => {
  // Prefer the most recently started activity if there are several.
  let best: { name: string; startIso: string } | null = null;
  for (const t of timers.values()) {
    const name = t.locationName || t.client || '—';
    if (!best || parseISO(t.startTime) > parseISO(best.startIso)) {
      best = { name, startIso: t.startTime };
    }
  }
  return best;
};

export const WorkDayStatusPanel: React.FC = () => {
  const { staff } = useMobileAuth();
  const { current, start: startWorkday } = useWorkDay();
  const { t } = useLanguage();
  const location = useLocation();

  const workdayOpen = !!current && !current.ended_at;
  const startIso = workdayOpen ? current!.started_at : null;

  const [, setTick] = useState(0);
  const [timers, setTimers] = useState<Map<string, ActiveTimer>>(loadTimers);
  const [startingDay, setStartingDay] = useState(false);
  const [justEnded, setJustEnded] = useState<{ totalSec: number; endedAt: number } | null>(null);

  // Live tick — every second while a workday is open OR a "just ended"
  // banner is showing (the latter just so the auto-collapse fires).
  useEffect(() => {
    if (!startIso && !justEnded) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startIso, justEnded]);

  // Refresh activity-row source — listen to local timer changes.
  useEffect(() => {
    const refresh = () => setTimers(loadTimers());
    refresh();
    window.addEventListener('timer-state-changed', refresh);
    const storageHandler = (e: StorageEvent) => {
      if (e.key === null || e.key === TIMERS_KEY) refresh();
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('timer-state-changed', refresh);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // Listen for end-of-day confirmation from workdayServerSync. Show a
  // "Workday ended — total X" card for 8 seconds, then collapse.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { endedAtIso?: string } | undefined;
      const endedAtIso = detail?.endedAtIso;
      const startedIso = current?.started_at;
      let total = 0;
      if (startedIso && endedAtIso) {
        total = Math.max(0, differenceInSeconds(parseISO(endedAtIso), parseISO(startedIso)));
      } else if (startedIso) {
        total = Math.max(0, differenceInSeconds(new Date(), parseISO(startedIso)));
      }
      setJustEnded({ totalSec: total, endedAt: Date.now() });
    };
    window.addEventListener('workday-ended', handler);
    return () => window.removeEventListener('workday-ended', handler);
  }, [current?.started_at]);

  // Auto-collapse "just ended" after 8s.
  useEffect(() => {
    if (!justEnded) return;
    const remaining = 8000 - (Date.now() - justEnded.endedAt);
    if (remaining <= 0) {
      setJustEnded(null);
      return;
    }
    const id = setTimeout(() => setJustEnded(null), remaining);
    return () => clearTimeout(id);
  }, [justEnded]);

  // If a fresh workday is opened after a "just ended" banner, drop the banner.
  useEffect(() => {
    if (workdayOpen && justEnded) setJustEnded(null);
  }, [workdayOpen, justEnded]);

  const elapsedSeconds = useMemo(() => {
    if (!startIso) return 0;
    return Math.max(0, differenceInSeconds(new Date(), parseISO(startIso)));
  }, [startIso]);

  const activity = useMemo(() => pickActivityFromTimers(timers), [timers]);
  const activityElapsed = useMemo(() => {
    if (!activity) return 0;
    return Math.max(0, differenceInSeconds(new Date(), parseISO(activity.startIso)));
  }, [activity]);

  const handleStartDay = useCallback(async () => {
    if (startingDay || workdayOpen) return;
    setStartingDay(true);
    try {
      clearWorkdayEnded();
      const wd = await startWorkday();
      if (!wd) toast.error(t('workday.couldNotStart'));
    } catch (err: any) {
      toast.error(err?.message || t('workday.couldNotStart'));
    } finally {
      setStartingDay(false);
    }
  }, [startingDay, workdayOpen, startWorkday, t]);

  const handleEndDay = useCallback(() => {
    // Defer to the central EOD pipeline owned by GlobalActiveTimerBanner.
    // Same event the assistant uses — keeps a single end-of-day path.
    window.dispatchEvent(new CustomEvent('request-end-day'));
  }, []);

  // Hide entirely on /m/report — that page has its own controls.
  if (!staff?.id || location.pathname === '/m/report') return null;

  // ── State 4: Just ended (transient confirmation) ───────────────────
  if (justEnded && !workdayOpen) {
    return (
      <div className="px-5 pt-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {t('workday.endedHeadline')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('workday.endedTotalLabel')}{' '}
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {formatHMS(justEnded.totalSec)}
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── State 1: Idle (no workday) ─────────────────────────────────────
  if (!workdayOpen) {
    return (
      <div className="px-5 pt-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sun className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {t('workday.idleHeadline')}
            </p>
          </div>
          <Button
            variant="default"
            className="w-full rounded-xl h-12 gap-2 text-sm font-semibold"
            onClick={handleStartDay}
            disabled={startingDay}
            title={t('workday.startDayTitle')}
          >
            {startingDay ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {startingDay ? t('workday.starting') : t('workday.startDay')}
          </Button>
        </div>
      </div>
    );
  }

  // ── State 2/3: Workday active ──────────────────────────────────────
  const hasActivity = !!activity;

  return (
    <div className="px-5 pt-3">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        {/* Headline + live day timer */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {t('workday.activeHeadline')}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t('workday.startedAtLabel')} {formatStartTime(startIso!)}
            </p>
          </div>
          <div
            className="font-mono font-extrabold text-xl tabular-nums text-primary leading-none"
            aria-label={t('workday.todayTime')}
          >
            {formatHMS(elapsedSeconds)}
          </div>
        </div>

        {/* Activity row — separate from the day timer to avoid confusion */}
        <div
          className={cn(
            'rounded-xl px-3 py-2 flex items-center gap-2 text-xs',
            hasActivity ? 'bg-background border border-border' : 'bg-muted/40 text-muted-foreground'
          )}
        >
          <Activity className="w-3.5 h-3.5 shrink-0" />
          {hasActivity ? (
            <>
              <span className="font-medium text-foreground truncate">
                {t('workday.activityLabel')}: {activity!.name}
              </span>
              <span className="ml-auto font-mono tabular-nums text-foreground/80">
                {formatHMS(activityElapsed)}
              </span>
            </>
          ) : (
            <>
              <span className="truncate">{t('workday.noActivityActive')}</span>
              <span className="ml-auto opacity-70">{t('workday.dayKeepsRunning')}</span>
            </>
          )}
        </div>

        {/* End-day action */}
        <Button
          variant="default"
          className="w-full rounded-xl h-11 gap-2 text-sm font-semibold"
          onClick={handleEndDay}
          title={t('workday.endDayTitle')}
        >
          <LogOut className="w-4 h-4" />
          {t('workday.endDay')}
        </Button>
      </div>
    </div>
  );
};

export default WorkDayStatusPanel;
