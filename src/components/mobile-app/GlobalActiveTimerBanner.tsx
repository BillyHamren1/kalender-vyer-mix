// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Square, Building2, Loader2, LogOut, Play, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { EndOfDayStopDialog, type EndOfDayResult } from './EndOfDayStopDialog';
import { NextActionDialog } from './NextActionDialog';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useWorkSession, timerToTarget } from '@/hooks/useWorkSession';
import { useWorkDay } from '@/hooks/useWorkDay';
import { useGeofencingContext } from '@/contexts/GeofencingContext';
import { clearWorkdayEnded } from '@/services/workdayState';
import { endWorkdayFlow } from '@/services/workdayServerSync';
import { useLanguage } from '@/i18n/LanguageContext';
import { extractUTCTime } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';
import { useActiveDayState, type ActiveDayOpenEntry } from '@/hooks/useActiveDayState';
type ActiveDayOpenEntryLite = ActiveDayOpenEntry;
import { AlertTriangle, WifiOff } from 'lucide-react';

const TIMERS_KEY = 'eventflow-mobile-timers';
const PENDING_STOP_KEY = 'eventflow-pending-stop';

/**
 * Recovery only. The live UI source of truth is GeofencingContext.activeTimers.
 *
 * Do NOT use this for rendering the banner timer list — it exists solely as a
 * fallback for:
 *   - app restart / cold boot recovery (before the provider has rehydrated)
 *   - pending-stop reconciliation after the app was killed mid-stop
 *   - looking up a snapshot of a timer that has just been removed from context
 *
 * If you find yourself reaching for this in render code, stop and use
 * `useGeofencingContext().activeTimers` instead.
 */
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
 * GlobalActiveTimerBanner — visar aktiva timers + driver Avsluta-flödet,
 * samt erbjuder explicit "Starta dagen" när ingen workday är öppen.
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer = HUVUDSPÅR. Visas/handhas via useWorkDay (server). Knappen
 *      "Starta dagen" här är en av två giltiga sätt att skapa dagen
 *      (det andra är riktig geofence/start-action via useTimerStartFlow).
 *      App-open startar ALDRIG dagen implicit.
 *   2. Aktivitetstid = INUTI dagen. Banner-raderna (projekt/plats/bokning)
 *      är aktiviteter — att stoppa en aktivitet avslutar ALDRIG dagen.
 *   3. "Avsluta dagen" = SEPARAT handling. Knappen kör endWorkdayFlow som
 *      först stoppar aktiva aktiviteter (samma stopSession-väg) och
 *      DÄREFTER stänger workday. Lokala UI-knep får aldrig låtsas att
 *      dagen är slut innan servern bekräftat.
 *   4. Geofence = SIGNAL. Den här komponenten reagerar på 'request-end-day'
 *      från assistenten men gör själv ingen geo-logik.
 *
 * ROBUSTHET (Fas 1): All persistens går via useWorkSession.stopSession.
 * Komponenten har INGEN egen createTimeReport / closeOpenAnomalies /
 * break-dialog-logik längre — den samlar bara in användarens val (vanligt
 * stopp, EOD-dialog) och delegerar.
 *
 * ROBUSTHET (Fas 2): Vid 'request-end-day' med flera aktiva timers körs
 * de SEKVENTIELLT — en break-dialog/EOD-dialog per timer. En "saving"-
 * lock håller dialogen öppen tills sparet faktiskt lyckats, så användaren
 * inte stänger ner appen mitt i ett halv-skickat anrop.
 */
const GlobalActiveTimerBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { t } = useLanguage();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession, stopAny, dialogs: workSessionDialogs } = useWorkSession(bookings, staff?.id);
  const { current: currentWorkday, start: startWorkday } = useWorkDay();
  const workdayOpen = !!currentWorkday && !currentWorkday.ended_at;
  const [startingDay, setStartingDay] = useState(false);
  const [endingDay, setEndingDay] = useState(false);

  // Should we offer the user an explicit "Starta dag" entry point?
  // Only when logged in as mobile staff, no open workday, and we're inside
  // the mobile app shell (not /m/report which has its own controls).
  const showStartDay = !!staff?.id && !workdayOpen && !startingDay && !endingDay && location.pathname !== '/m/report';

  const handleStartDay = useCallback(async () => {
    if (startingDay || workdayOpen) return;
    setStartingDay(true);
    try {
      // User explicitly opening the day → clear any "ended today" latch
      // so auto-bootstrap and assistants treat it as a fresh active day.
      clearWorkdayEnded();
      const wd = await startWorkday();
      if (!wd) {
        toast.error(t('workday.couldNotStart'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('workday.couldNotStart'));
    } finally {
      setStartingDay(false);
    }
  }, [startingDay, workdayOpen, startWorkday, t]);


  // PRIMARY UI SOURCE: live activeTimers from the single GeofencingProvider.
  // Reactive — start/stop in useGeofencing setActiveTimers() rerenders this
  // banner immediately (no localStorage polling lag for new timers).
  const { activeTimers } = useGeofencingContext();
  const timers = activeTimers;
  const { state: activeDayState, refresh: refreshActiveDayState } = useActiveDayState();
  const [, setTick] = useState(0);
  const [pendingStop, setPendingStop] = useState<PendingStop | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  /** Set after a successful per-row stop so we can ask "what's next?". */
  const [nextActionFor, setNextActionFor] = useState<{ name: string } | null>(null);

  // Sequential EOD queue: keys waiting to be processed one-by-one
  const eodQueueRef = useRef<string[]>([]);
  const eodProcessingRef = useRef(false);
  // Set when the user explicitly cancels EOD inside the dialog. Tells the
  // queue processor to stop draining AND to skip the final endWorkdayFlow.
  const eodCancelledRef = useRef(false);

  // Drain helper: wait until provider's activeTimers map is empty (post-EOD).
  // Mirrors what loadTimersFromStorage used to check, but reads from the
  // live ref so we don't depend on localStorage flushing.
  const timersRef = useRef(timers);
  useEffect(() => { timersRef.current = timers; }, [timers]);
  const waitForLocalTimerDrain = useCallback(async () => {
    for (let i = 0; i < 12; i += 1) {
      if (timersRef.current.size === 0) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return timersRef.current.size === 0;
  }, []);

  // 1Hz tick for the elapsed clock display only — does NOT drive timer
  // membership (that comes reactively from the provider).
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
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
  // Honors eodCancelledRef: if the user cancels in the dialog the queue
  // is dropped and the workday is NOT ended.
  const processNextEod = useCallback(async () => {
    if (eodProcessingRef.current) return;
    eodProcessingRef.current = true;
    try {
      while (eodQueueRef.current.length > 0) {
        if (eodCancelledRef.current) {
          eodQueueRef.current = [];
          break;
        }
        const key = eodQueueRef.current.shift()!;
        const timer = timersRef.current.get(key) ?? loadTimersFromStorage().get(key);
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
      if (
        !eodCancelledRef.current &&
        localTimersDrained &&
        !pendingStopRef.current
      ) {
        // Server-first end-day via central rutin. Vid fel: lämna dagen
        // tydligt needs-review (lokal cache rörs inte) och toasta.
        setEndingDay(true);
        const startedAtIso = currentWorkdayRef.current?.started_at ?? null;
        const result = await endWorkdayFlow();
        if (!result.ok) {
          toast.error(result.error || t('workday.couldNotEnd'));
          setEndingDay(false);
        } else {
          // Build a "Workday ended — total time" confirmation so the user
          // sees that the press worked even though the UI just collapsed.
          let totalLabel = '';
          if (startedAtIso) {
            const total = Math.max(0, differenceInSeconds(new Date(), parseISO(startedAtIso)));
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            totalLabel = ` — ${t('workday.totalTime')} ${h}h ${m}m`;
          }
          toast.success(`${t('workday.dayEnded')}${totalLabel}`);
          // Brief grace so the "Starta dagen" button doesn't pop in
          // the same frame as the "Avsluta dagen" disappears.
          setTimeout(() => setEndingDay(false), 400);
        }
      } else if (eodCancelledRef.current) {
        setEndingDay(false);
      }
    }
  }, [handleStop, waitForLocalTimerDrain, t]);

  // Mirror pendingStop into a ref so the queue processor can poll it
  // without re-creating itself on every state change.
  const pendingStopRef = useRef<PendingStop | null>(null);
  useEffect(() => {
    pendingStopRef.current = pendingStop;
  }, [pendingStop]);

  // Mirror currentWorkday into a ref so the EOD finalizer can read the
  // started_at without taking a hook-deps dependency on it.
  const currentWorkdayRef = useRef(currentWorkday);
  useEffect(() => {
    currentWorkdayRef.current = currentWorkday;
  }, [currentWorkday]);

  // request-end-day: enqueue ALL active timers and process sequentially.
  // Replaces the legacy "flera timers — välj manuellt" toast.
  useEffect(() => {
    const onRequestEndDay = async () => {
      // Fresh end-day attempt → clear any stale "cancelled" flag from a
      // previous run so we actually end the day this time.
      eodCancelledRef.current = false;
      const entries = Array.from(timers.entries());
      if (entries.length === 0) {
        // Inga aktiva timers → kör direkt central end-day-rutin.
        setEndingDay(true);
        const startedAtIso = currentWorkdayRef.current?.started_at ?? null;
        const result = await endWorkdayFlow();
        if (result.ok) {
          let totalLabel = '';
          if (startedAtIso) {
            const total = Math.max(0, differenceInSeconds(new Date(), parseISO(startedAtIso)));
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            totalLabel = ` — ${t('workday.totalTime')} ${h}h ${m}m`;
          }
          toast.success(`${t('workday.dayEnded')}${totalLabel}`);
          setTimeout(() => setEndingDay(false), 400);
        } else {
          toast.error(result.error || t('workday.couldNotEnd'));
          setEndingDay(false);
        }
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

  // ── Server vs local divergence hints ────────────────────────────────
  // Build a set of local timer keys for fast lookup against the server
  // snapshot. We treat "the same activity" as the same target_kind+id.
  const localKeySet = new Set<string>(Array.from(timers.keys()));
  const serverOpenEntries = activeDayState?.open_entries ?? [];

  const serverKeyFor = (e: ActiveDayOpenEntryLite): string | null => {
    if (e.target_kind === 'location' && e.target_id) return `location-${e.target_id}`;
    if (e.target_kind === 'large_project' && e.target_id) return `project-${e.target_id}`;
    if (e.target_kind === 'booking' && e.target_id) return e.target_id;
    return null;
  };

  // Server has it open, but our local map doesn't → show recovery row.
  const serverOnlyEntries = serverOpenEntries.filter((e) => {
    const k = serverKeyFor(e);
    return !!k && !localKeySet.has(k);
  });

  // Local says timer is running, but server has no matching open LTE
  // → likely a pending-sync race. Mark explicitly (not as confirmed run).
  const localOnlyKeys: string[] = [];
  for (const [key, timer] of timers.entries()) {
    // Only flag confirmed activity timers (not pendingSync ones — those
    // are already styled as "syncing"). And only flag if at least one
    // server fetch has completed.
    if (!activeDayState) continue;
    if ((timer as any).serverEntryId) continue; // we know server side
    const matched = serverOpenEntries.some((e) => serverKeyFor(e) === key);
    if (!matched) localOnlyKeys.push(key);
  }

  const stalePing = !!activeDayState?.stale_ping && !!activeDayState?.workday;

  // Stoppa en server-öppen entry direkt mot mobile-app-api. Ingen
  // local timer behövs — servern är sanning. Vid ok refreshas
  // active_day_state så raden försvinner.
  const handleStopServerEntry = useCallback(async (entry: ActiveDayOpenEntryLite) => {
    try {
      await stopAny({
        serverEntryId: entry.id,
        stopReason: 'banner_stop_server_only',
      });
      toast.success('Aktivitet stoppad');
      await refreshActiveDayState();
    } catch (err: any) {
      toast.error(err?.message || t('common.couldNotSaveRetry'));
    }
  }, [stopAny, refreshActiveDayState, t]);

  // UNIFIED MODEL (2026-05-06): På /m/jobs äger WorkDayPanel den synliga
  // "tid registreras just nu på"-statusen. För att inte dubblera samma info
  // som en separat rad ovanför panelen döljer vi aktivitets-raderna där.
  // Sync-warning (server-only / stale_ping / sync-problem) visas alltid —
  // det är inte en huvudtimer utan en korrigeringssignal användaren måste se.
  const onJobsPage = location.pathname === '/m/jobs' || location.pathname === '/m';
  const showActivityRows = !onJobsPage;
  const hasSyncWarning =
    stalePing || serverOnlyEntries.length > 0 || localOnlyKeys.length > 0;

  // SINGLE-TIMER UI MODEL: WorkDayPanel är den enda synliga timern. Denna
  // komponent renderar inte längre timer-rader, sync-warnings eller
  // server-only-rader — den lever kvar för EOD/stop-flödet (request-end-day
  // event + EndOfDayStopDialog). All visuell information om aktiv timer
  // kommer från useActiveTimerStatus i WorkDayPanel.
  return (
    <>
      {/* (timer-rader och sync-warnings borttagna — visas i WorkDayPanel) */}

      {/* Start/End day CTA moved into centered MobileHeader controls so the
          day clock and the primary action live in one obvious place. */}
      {pendingStop && (
        <EndOfDayStopDialog
          open={!!pendingStop}
          onOpenChange={(open) => {
            // Outside-click / Escape are intercepted inside the dialog and
            // routed to onCancel — this prop is only triggered by an
            // explicit programmatic close. While saving we ignore it so
            // the dialog stays mounted until the request settles.
            if (!open && !savingKeys.has(pendingStop.key)) {
              setPendingStop(null);
            }
          }}
          lastExitIso={pendingStop.lastExitIso}
          locationName={pendingStop.locationName}
          onConfirm={handleDialogConfirm}
          onCancel={() => {
            // Explicit user cancel = abort the entire end-day flow:
            //   • close dialog
            //   • DO NOT stop the active timer
            //   • drain the EOD queue and skip endWorkdayFlow
            // The timer keeps running, the workday stays open. The user
            // is back in a known, safe state.
            if (savingKeys.has(pendingStop.key)) return;
            eodCancelledRef.current = true;
            eodQueueRef.current = [];
            setPendingStop(null);
            toast.message(t('workday.endDayCancelled'));
          }}
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
  syncProblem?: boolean;
}> = ({ timerKey, timer, isSaving, onStop, syncProblem = false }) => {
  const isLocation = !!timer.locationId;

  // Two-tap confirmation — first tap arms ("Tryck igen"), second tap stops.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  // UNIFIED MODEL: only the workday clock ticks. The activity row is a
  // status indicator ("var tiden registreras just nu"), not its own timer.
  const handleClick = () => {
    if (isSaving) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onStop(timerKey, timer);
  };

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-2xl border',
      syncProblem ? 'border-warning/40 bg-warning/10' : 'border-primary/20 bg-primary/5'
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-primary/70">
          Tid registreras här
        </p>
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5 mt-0.5">
          {isLocation && <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />}
          {timer.locationName || timer.client}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sedan {extractUTCTime(timer.startTime)}
          {timer.isAutoStarted && ' (automatiskt)'}
          {syncProblem && ' · synkproblem — server saknar rad'}
        </p>
      </div>
      <Button
        size="sm"
        variant={armed ? 'destructive' : 'outline'}
        className="rounded-xl h-9 gap-1 text-xs font-semibold"
        onClick={handleClick}
        disabled={isSaving}
        title={armed ? 'Tryck igen för att sluta registrera tid här' : 'Sluta registrera tid här — arbetsdagen fortsätter'}
      >
        {isSaving
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Square className="w-3 h-3" />}
        {isSaving ? 'Sparar…' : armed ? 'Tryck igen' : 'Sluta här'}
      </Button>
    </div>
  );
};

/**
 * ServerEntryRow — visar en location_time_entry som ligger öppen på servern
 * men saknar lokal motsvarighet. Behandlas som en RIKTIG aktiv timer:
 *   • elapsed-klocka från entered_at
 *   • Stoppa-knapp (entry_id-baserad, går direkt mot mobile-app-api)
 *   • Korrigera-knapp (öppnar /m/report för efterredigering)
 *   • Återställ lokalt-knapp (refreshar active_day_state, hjälper när
 *     localStorage är ur synk).
 *
 * Servern är sanning — användaren måste alltid kunna stoppa raden
 * även om localStorage är tomt.
 */
const ServerEntryRow: React.FC<{
  entry: ActiveDayOpenEntryLite;
  onStop: (entry: ActiveDayOpenEntryLite) => Promise<void>;
  onCorrect: () => void;
  onRehydrate: () => void;
}> = ({ entry, onStop, onCorrect, onRehydrate }) => {
  const [, setTick] = useState(0);
  const [armed, setArmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  const handleStopClick = async () => {
    if (saving) return;
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    setSaving(true);
    try { await onStop(entry); } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/30 bg-primary/5">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-primary/70">
          Tid registreras här
        </p>
        <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5 mt-0.5">
          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
          {entry.target_label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sedan {extractUTCTime(entry.entered_at)} · serverstyrd
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="rounded-xl h-9 w-9 p-0"
          onClick={onCorrect}
          title="Korrigera tidrapporten"
          aria-label="Korrigera"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-xl h-9 w-9 p-0"
          onClick={onRehydrate}
          title="Återställ lokalt — hämta server-status igen"
          aria-label="Återställ lokalt"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant={armed ? 'destructive' : 'outline'}
          className="rounded-xl h-9 gap-1 text-xs font-semibold"
          onClick={handleStopClick}
          disabled={saving}
          title={armed ? 'Tryck igen för att avsluta aktiviteten på servern' : 'Avsluta aktiviteten — stoppar serverns öppna rad'}
        >
          {saving
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Square className="w-3 h-3" />}
          {saving ? 'Sparar…' : armed ? 'Tryck igen' : 'Stopp'}
        </Button>
      </div>
    </div>
  );
};

export default GlobalActiveTimerBanner;
