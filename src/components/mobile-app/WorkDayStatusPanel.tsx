import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Square, Loader2, CheckCircle2 } from 'lucide-react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useLocation } from 'react-router-dom';
import { clearWorkdayEnded } from '@/services/workdayState';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * WorkDayStatusPanel — kompakt kort: klocka i mitten, start/stopp under.
 * Ingen aktivitetsrad, ingen "started at"-text, ingen headline.
 * Tar lika mycket plats som en knapp.
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

export const WorkDayStatusPanel: React.FC = () => {
  const { staff } = useMobileAuth();
  const { current, start: startWorkday } = useWorkDay();
  const { t } = useLanguage();
  const location = useLocation();

  const workdayOpen = !!current && !current.ended_at;
  const startIso = workdayOpen ? current!.started_at : null;

  const [, setTick] = useState(0);
  const [startingDay, setStartingDay] = useState(false);
  const [justEnded, setJustEnded] = useState<{ totalSec: number; endedAt: number } | null>(null);

  useEffect(() => {
    if (!startIso && !justEnded) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startIso, justEnded]);

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

  useEffect(() => {
    if (!justEnded) return;
    const remaining = 6000 - (Date.now() - justEnded.endedAt);
    if (remaining <= 0) { setJustEnded(null); return; }
    const id = setTimeout(() => setJustEnded(null), remaining);
    return () => clearTimeout(id);
  }, [justEnded]);

  useEffect(() => {
    if (workdayOpen && justEnded) setJustEnded(null);
  }, [workdayOpen, justEnded]);

  const elapsedSeconds = useMemo(() => {
    if (!startIso) return 0;
    return Math.max(0, differenceInSeconds(new Date(), parseISO(startIso)));
  }, [startIso]);

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
    window.dispatchEvent(new CustomEvent('request-end-day'));
  }, []);

  if (!staff?.id || location.pathname === '/m/report') return null;

  // ── Just ended (transient) ─────────────────────────────────────────
  if (justEnded && !workdayOpen) {
    return (
      <div className="px-4 pt-2">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-mono tabular-nums font-semibold text-foreground">
            {formatHMS(justEnded.totalSec)}
          </span>
        </div>
      </div>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────
  if (!workdayOpen) {
    return (
      <div className="px-4 pt-2">
        <button
          type="button"
          onClick={handleStartDay}
          disabled={startingDay}
          className={cn(
            'w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2',
            'bg-primary text-primary-foreground active:scale-[0.98] transition-all',
            'disabled:opacity-60'
          )}
        >
          {startingDay ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {startingDay ? t('workday.starting') : t('workday.startDay')}
        </button>
      </div>
    );
  }

  // ── Active: clock centered, stop button under ──────────────────────
  return (
    <div className="px-4 pt-2">
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 flex flex-col items-center gap-1.5">
        <div
          className="font-mono font-extrabold text-2xl tabular-nums text-primary leading-none"
          aria-label={t('workday.todayTime')}
        >
          {formatHMS(elapsedSeconds)}
        </div>
        <button
          type="button"
          onClick={handleEndDay}
          className={cn(
            'w-full h-9 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5',
            'bg-primary text-primary-foreground active:scale-[0.98] transition-all'
          )}
        >
          <Square className="w-3.5 h-3.5" />
          {t('workday.endDay')}
        </button>
      </div>
    </div>
  );
};

export default WorkDayStatusPanel;
