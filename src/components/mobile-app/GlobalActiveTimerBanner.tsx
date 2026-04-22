import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { EndOfDayStopDialog, type EndOfDayResult } from './EndOfDayStopDialog';
import { NextActionDialog } from './NextActionDialog';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useWorkSession, timerToTarget } from '@/hooks/useWorkSession';
import { markWorkdayEnded } from '@/services/workdayState';
import { syncWorkDayEnd } from '@/services/workdayServerSync';
import { useLanguage } from '@/i18n/LanguageContext';

const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';

function loadTimersFromStorage(): Map<string, ActiveTimer> {
  try {
    const raw = localStorage.getItem(TIMERS_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

interface PendingStop {
  key: string;
  timer: ActiveTimer;
  startTimeDate: Date;
  lastExitIso: string;
  locationName: string | null;
}

/**
 * GlobalActiveTimerBanner — visar aktiva timers + driver Avsluta-flödet.
 *
 * ROBUSTHET (Fas 1): All persistens går nu via useWorkSession.stopSession.
 * Den här komponenten har INGEN egen createTimeReport / closeOpenAnomalies
 * / break-dialog-logik längre — den bara samlar in användarens val (vanligt
 * stopp, EOD-dialog) och delegerar.
 *
 * ROBUSTHET (Fas 2): Vid 'request-end-day' med flera aktiva timers körs
 * de SEKVENTIELLT — en break-dialog/EOD-dialog per timer. En "saving"-
 * lock håller dialogen öppen tills sparet faktiskt lyckats, så användaren
 * inte stänger ner appen mitt i ett halv-skickat anrop.
 */
const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const { staff } = useMobileAuth();
  const { t } = useLanguage();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession, dialogs: workSessionDialogs } = useWorkSession(bookings, staff?.id);

  const [timers, setTimers] = useState<Map<string, ActiveTimer>>(loadTimersFromStorage);
  const [, setTick] = useState(0);
  const [pendingStop, setPendingStop] = useState<PendingStop | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  /** Set after a successful per-row stop so we can ask "what's next?". */
  const [nextActionFor, setNextActionFor] = useState<{ name: string } | null>(null);

  // Sequential EOD queue: keys waiting to be processed one-by-one
  const eodQueueRef = useRef<string[]>([]);
  const eodProcessingRef = useRef(false);

  const waitForLocalTimerDrain = useCallback(async () => {
    for (let i = 0; i < 12; i += 1) {
      if (loadTimersFromStorage().size === 0) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return loadTimersFromStorage().size === 0;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(loadTimersFromStorage());
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => setTimers(loadTimersFromStorage());
    // Cross-tab/storage events: ONLY react when our timer key changed.
    // Without this filter every unrelated localStorage write (theme,
    // chat draft, etc.) re-renders the banner and re-reads the timers,
    // which has caused phantom "flicker" / sync-state confusion.
    const storageHandler = (e: StorageEvent) => {
      if (e.key === null || e.key === TIMERS_KEY) handler();
    };
    window.addEventListener('timer-state-changed', handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('timer-state-changed', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // C8 — Restore any pending-stop dialog state if app was killed mid-confirmation
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_STOP_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.key && parsed.timer && parsed.startTimeIso && parsed.lastExitIso) {
        // Only restore if the timer is still active locally; otherwise
        // it was already saved by another path and the pendingStop is stale.
        const current = loadTimersFromStorage();
        if (!current.has(parsed.key)) {
          localStorage.removeItem(PENDING_STOP_KEY);
          return;
        }
        setPendingStop({
          key: parsed.key,
          timer: parsed.timer,
          startTimeDate: parseISO(parsed.startTimeIso),
          lastExitIso: parsed.lastExitIso,
          locationName: parsed.locationName ?? null,
        });
      }
    } catch {
      // ignore corrupt state
      localStorage.removeItem(PENDING_STOP_KEY);
    }
  }, []);

  // Persist pending-stop to localStorage so it survives app kill
  useEffect(() => {
    if (!pendingStop) {
      localStorage.removeItem(PENDING_STOP_KEY);
      return;
    }
    try {
      localStorage.setItem(PENDING_STOP_KEY, JSON.stringify({
        key: pendingStop.key,
        timer: pendingStop.timer,
        startTimeIso: pendingStop.startTimeDate.toISOString(),
        lastExitIso: pendingStop.lastExitIso,
        locationName: pendingStop.locationName,
      }));
    } catch {}
  }, [pendingStop]);

  /**
   * Vanligt Avsluta-tryck. Om det finns ett geofence-exit som ligger i
   * sessionen och är >= 2 min gammalt → öppna EOD-dialogen i stället
   * för att tyst använda "nu" som sluttid. Annars delegera direkt till
   * useWorkSession.stopSession (som hanterar break-dialog + persistens).
   */
  const handleStop = useCallback(async (key: string, timer: ActiveTimer) => {
    if (savingKeys.has(key)) return; // already saving, ignore double-tap

    const stopTime = new Date();
    const startTimeDate = parseISO(timer.startTime);

    // Check if user already left the workplace earlier
    let lastExit: { exited_at: string; location_id: string | null; location_name: string | null } | null = null;
    try {
      const res = await mobileApi.getLastWorkplaceExit();
      lastExit = res.last_exit;
    } catch (err) {
      console.warn('Could not fetch last workplace exit:', err);
    }

    if (lastExit?.exited_at) {
      const exitDate = parseISO(lastExit.exited_at);
      const gapMin = (stopTime.getTime() - exitDate.getTime()) / 60000;
      const isWithinSession = exitDate.getTime() > startTimeDate.getTime();
      if (isWithinSession && gapMin >= 2) {
        setPendingStop({
          key,
          timer,
          startTimeDate,
          lastExitIso: lastExit.exited_at,
          locationName: lastExit.location_name,
        });
        return;
      }
    }

    // No EOD dialog needed — delegate to the unified engine.
    setSavingKeys(prev => new Set(prev).add(key));
    try {
      const res = await stopSession(timerToTarget(key, timer));
      // After a successful save, ask user what's next so the day isn't broken.
      // Skip when the stop was cancelled (break-dialog dismissed) or while
      // the global EOD queue is draining (those timers are already on their
      // way out — no need to re-ask).
      if (res && !res.cancelled && !eodProcessingRef.current) {
        setNextActionFor({ name: timer.locationName || timer.client || t('workday.activityFallback') });
      }
    } catch (err: any) {
      toast.error(err?.message || t('common.couldNotSaveRetry'));
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [savingKeys, stopSession]);

  /**
   * EOD-dialogen är klar. Användaren har valt sluttid (kanske "nu", kanske
   * geofence-exit, kanske annan tid + beskrivning). Vi delegerar till
   * useWorkSession.stopSession med endOfDayContext + stopAtIso. Dialogen
   * hålls öppen tills sparet lyckas (auto-retry-vänligt UX).
   */
  const handleDialogConfirm = useCallback(async (result: EndOfDayResult) => {
    if (!pendingStop) return;
    const target = timerToTarget(pendingStop.key, pendingStop.timer);

    setSavingKeys(prev => new Set(prev).add(pendingStop.key));
    try {
      await stopSession(target, {
        stopAtIso: result.endedAtIso,
        endOfDayContext: result.usedSuggestedExit
          ? undefined
          : {
              lastExitIso: pendingStop.lastExitIso,
              endedAtIso: result.endedAtIso,
              workDescription: result.workDescription,
            },
      });
      setPendingStop(null); // success → close dialog
    } catch (err: any) {
      // Auto-retry behaviour: keep dialog open, surface a toast, let user
      // press Spara again. Server is unchanged so retry is safe.
      toast.error(err?.message || t('common.couldNotSaveRetry'));
      throw err; // re-throw so dialog's submitting state resolves correctly
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(pendingStop.key);
        return next;
      });
    }
  }, [pendingStop, stopSession]);

  // Sequential EOD processor — drains the queue one timer at a time.
  const processNextEod = useCallback(async () => {
    if (eodProcessingRef.current) return;
    eodProcessingRef.current = true;
    try {
      while (eodQueueRef.current.length > 0) {
        const key = eodQueueRef.current.shift()!;
        const current = loadTimersFromStorage();
        const timer = current.get(key);
        if (!timer) continue;
        // Wait until any in-flight save for this key finishes before opening
        // its dialog (handleStop sets savingKeys synchronously).
        await new Promise<void>((resolve) => {
          handleStop(key, timer).finally(resolve);
        });
        // If handleStop opened the EOD dialog, wait for it to close before
        // moving to the next timer in the queue.
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!pendingStopRef.current) {
              resolve();
            } else {
              setTimeout(check, 250);
            }
          };
          check();
        });
      }
    } finally {
      eodProcessingRef.current = false;
      // EOD queue drained — wait for local timer storage to actually flush
      // before ending the day. This avoids the header day-timer surviving
      // a just-completed EOD because React/localStorage had not caught up yet.
      const localTimersDrained = await waitForLocalTimerDrain();
      if (localTimersDrained && !pendingStopRef.current) {
        // Server-first: close the workdays row BEFORE marking local state.
        // workdays/useWorkDay is the source of truth — local cache and the
        // 'workday-ended' event must only fire once the server confirms.
        const result = await syncWorkDayEnd();
        if (result.ok) {
          markWorkdayEnded();
          window.dispatchEvent(new CustomEvent('workday-ended'));
        } else {
          toast.error(result.error || 'Kunde inte avsluta arbetsdagen');
        }
      }
    }
  }, [handleStop, waitForLocalTimerDrain]);

  // Mirror pendingStop into a ref so the queue processor can poll it
  // without re-creating itself on every state change.
  const pendingStopRef = useRef<PendingStop | null>(null);
  useEffect(() => {
    pendingStopRef.current = pendingStop;
  }, [pendingStop]);

  // request-end-day: enqueue ALL active timers and process sequentially.
  // Replaces the legacy "flera timers — välj manuellt" toast.
  useEffect(() => {
    const onRequestEndDay = () => {
      const entries = Array.from(timers.entries());
      if (entries.length === 0) {
        markWorkdayEnded();
        syncWorkDayEnd();
        window.dispatchEvent(new CustomEvent('workday-ended'));
        toast.message(t('workday.noActiveTimers'));
        return;
      }
      // Avoid duplicate queueing if user fires the event twice
      const queued = new Set(eodQueueRef.current);
      for (const [key] of entries) {
        if (!queued.has(key)) eodQueueRef.current.push(key);
      }
      void processNextEod();
    };
    window.addEventListener('request-end-day', onRequestEndDay);
    return () => window.removeEventListener('request-end-day', onRequestEndDay);
  }, [timers, processNextEod]);

  if (location.pathname === '/m/report') return null;

  return (
    <>
      {timers.size > 0 && (
        <div className="relative z-20 px-5 pt-3 space-y-2">
          {Array.from(timers.entries()).map(([key, timer]) => (
            <TimerRow
              key={key}
              timerKey={key}
              timer={timer}
              isSaving={savingKeys.has(key)}
              onStop={handleStop}
            />
          ))}
        </div>
      )}
      {/* "Avsluta dagen" — fixed längst ner ovanför bottennaven så den
          aldrig hamnar bakom innehåll eller dubblerar timer-raderna. */}
      {timers.size > 0 && location.pathname !== '/m/report' && (
        <div className="fixed bottom-20 left-0 right-0 z-30 px-5 pointer-events-none">
          <Button
            variant="default"
            className="w-full rounded-2xl h-12 gap-2 text-sm font-semibold shadow-lg pointer-events-auto"
            onClick={() => window.dispatchEvent(new CustomEvent('request-end-day'))}
            disabled={savingKeys.size > 0}
            title={t('workday.endDayTitle')}
          >
            <LogOut className="w-4 h-4" />
            {t('workday.endDay')}
          </Button>
        </div>
      )}
      {pendingStop && (
        <EndOfDayStopDialog
          open={!!pendingStop}
          onOpenChange={(open) => {
            // Closing without confirming = behåll timer + dialog tills användaren
            // gör ett aktivt val. Dialogen hindrar själv stängning under save.
            if (!open && !savingKeys.has(pendingStop.key)) {
              setPendingStop(null);
            }
          }}
          lastExitIso={pendingStop.lastExitIso}
          locationName={pendingStop.locationName}
          onConfirm={handleDialogConfirm}
        />
      )}
      {nextActionFor && (
        <NextActionDialog
          open={!!nextActionFor}
          closedActivityName={nextActionFor.name}
          onOpenChange={(open) => {
            if (!open) setNextActionFor(null);
          }}
        />
      )}
      {workSessionDialogs}
    </>
  );
};

const TimerRow: React.FC<{
  timerKey: string;
  timer: ActiveTimer;
  isSaving: boolean;
  onStop: (key: string, timer: ActiveTimer) => void;
}> = ({ timerKey, timer, isSaving, onStop }) => {
  const elapsed = differenceInSeconds(new Date(), parseISO(timer.startTime));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const isLocation = !!timer.locationId;

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/20 bg-primary/5">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5">
          {isLocation && <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />}
          {timer.locationName || timer.client}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Startad {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (automatiskt)'}
        </p>
      </div>
      <div className="font-mono font-extrabold text-base tabular-nums text-primary">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="rounded-xl h-9 gap-1 text-xs font-semibold"
        onClick={() => onStop(timerKey, timer)}
        disabled={isSaving}
        title="Avsluta aktiviteten — sparar tidrapporten"
      >
        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
        {isSaving ? 'Sparar…' : 'Avsluta aktivitet'}
      </Button>
    </div>
  );
};

export default GlobalActiveTimerBanner;
