import React, { useEffect, useRef, useState, useCallback } from 'react';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
import GlobalActiveTimerBanner from './GlobalActiveTimerBanner';
import UnifiedArrivalPrompt from './UnifiedArrivalPrompt';
import AutoArrivalNotice from './AutoArrivalNotice';
import StaleTimerDialog from './StaleTimerDialog';
import { WorkDayAssistant } from './WorkDayAssistant';
import EndDayOnArrivalHomeDialog from './EndDayOnArrivalHomeDialog';
import LastShiftEndPrompt from './LastShiftEndPrompt';
import UnplannedVisitBanner from './UnplannedVisitBanner';
import StaleDayCorrectionDialog from './StaleDayCorrectionDialog';
import { useEndDayOnArrivalHome } from '@/hooks/useEndDayOnArrivalHome';
import { useLastShiftEndDetection } from '@/hooks/useLastShiftEndDetection';
import { useUnplannedSiteVisit } from '@/hooks/useUnplannedSiteVisit';
import { useStaleDayCorrection } from '@/hooks/useStaleDayCorrection';
import { useStaleDayReminder } from '@/hooks/useStaleDayReminder';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { useArrivalPrompt } from '@/hooks/useArrivalPrompt';
import { useTimerReconciliation } from '@/hooks/useTimerReconciliation';
import { useWorkDayAssistant } from '@/hooks/useWorkDayAssistant';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useWorkSession, timerToTarget, resolveTargetKey, type WorkTarget } from '@/hooks/useWorkSession';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { useGeofencingContext } from '@/contexts/GeofencingContext';
import { useWorkDay } from '@/hooks/useWorkDay';
import { format, parseISO } from 'date-fns';
import { TimerConflictDialog } from '@/components/mobile-app/TimerConflictDialog';
import DistanceWarningDialog from '@/components/mobile-app/DistanceWarningDialog';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { registerGeofenceAutoActions } from '@/hooks/useGeofencing';
import type { ArrivalTarget } from '@/types/arrivalTarget';
import { initLocationPingHandler } from '@/services/locationPingHandler';
import { isArrivalTargetPlannedToday } from '@/lib/mobileBookingPlanning';

/**
 * MobileGlobalOverlays — single source of truth for ALL global mobile flows.
 *
 * Mounted by both `MobileAppLayout` (web /m/*) and `TimeAppLayout` (native EventFlow Time
 * shell, VITE_APP_MODE='time') so the assistant, arrival prompt, stale-timer dialog,
 * travel banner, and global timer banner behave identically across shells.
 *
 * Renders:
 *  - GlobalActiveTimerBanner (visual, top of content)
 *  - TravelBanner (visual, top of content)
 *  - TravelCompletedDialog, ArrivalPromptDialog, StaleTimerDialog, WorkDayAssistant (Radix portals)
 *
 * NOTE: Banners are visual; the parent layout decides where they sit relative to scroll.
 * Since this component returns a fragment, banners render at the position where the
 * component is mounted in the JSX tree. Place it where banners should appear.
 */
const MobileGlobalOverlays: React.FC = () => {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();
  const { latestPosition } = useBackgroundLocationReporter(staff?.id);
  const { data: bookings = [] } = useMobileBookings();

  // NOTE: Workday is NEVER auto-started on app-open. A workday is only created
  // when the user explicitly starts an activity timer (via useTimerStartFlow).
  // Opening the app must be a pure read/restore operation — no side effects.


  // Lugn påminnelse om ofärdig tidigare dag (gårdagen). Throttlas internt.
  useStaleDayReminder(!!staff);

  // Server-triggered "ping the phone" — listen for FCM data-pushes with
  // notification_type=location_ping and respond with a fresh GPS sample.
  // Idempotent: handler is mounted once globally regardless of re-renders.
  useEffect(() => {
    if (!staff) return;
    const dispose = initLocationPingHandler({
      getCurrentPosition: () =>
        new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('no geolocation'));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? null,
                speed: pos.coords.speed ?? null,
              }),
            reject,
            { timeout: 8000, maximumAge: 30_000, enableHighAccuracy: true },
          );
        }),
    });
    return dispose;
  }, [staff]);

  // UNIFIED start flow — same conflict + distance + start machinery as
  // every other start-surface in the mobile app. Direct startSession()
  // calls from arrival flow are forbidden.
  const {
    requestStart,
    tryStartFromArrival,
    tryAutoSwitchFromArrival,
    cancelConflict,
    confirmSwitch,
    conflictEval,
    pendingLabel,
    distanceWarning,
    dismissDistanceWarning,
  } = useTimerStartFlow(bookings, staff?.id);

  // UNIFIED stop engine — stale-save now goes through stopSession so the
  // same break/anomaly/time_report ownership rules apply (no rogue
  // mobileApi.createTimeReport calls; correct time_report_id linkage).
  const { stopSession, dialogs: workSessionDialogs } = useWorkSession(
    bookings,
    staff?.id,
  );

  // Provider-source-of-truth för aktiva timers — används för att verifiera
  // att arrival-confirm faktiskt resulterade i en aktivitetstimer innan vi
  // markerar prompten som resolved.
  const { activeTimers: providerActiveTimers } = useGeofencingContext();

  // Workday state — vi måste verifiera att dagen faktiskt syns innan
  // arrival-prompten markeras resolved.
  const { current: currentWorkday, refresh: refreshWorkday, ensureActive: ensureWorkDayActive } = useWorkDay();
  const currentWorkdayRef = useRef(currentWorkday);
  useEffect(() => {
    currentWorkdayRef.current = currentWorkday;
  }, [currentWorkday]);

  // Travel detection — runs globally regardless of active page.
  const { travelState, elapsedSeconds, manualStopTravel, completedTravel, dismissCompletedTravel } =
    useTravelDetection(!!staff, latestPosition);

  // EOD reconciliation now runs inside useWorkSession (mounted by
  // GlobalActiveTimerBanner) and no longer persists a localStorage flag.
  const eodActive = false;

  // Read activeTimers from localStorage so we don't double-mount geofencing.
  const [activeTimersForAssistant, setActiveTimersForAssistant] =
    useState<Map<string, ActiveTimer>>(new Map());
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('eventflow-mobile-timers');
        setActiveTimersForAssistant(new Map(raw ? JSON.parse(raw) : []));
      } catch {
        setActiveTimersForAssistant(new Map());
      }
    };
    load();
    window.addEventListener('timer-state-changed', load);
    const id = window.setInterval(load, 15_000);
    return () => {
      window.removeEventListener('timer-state-changed', load);
      window.clearInterval(id);
    };
  }, []);

  // Arrival prompt — same source-of-truth used by push-cron.
  const [arrivalDialogOpen, setArrivalDialogOpen] = useState(false);
  const [, setArrivalSubmitting] = useState(false);
  const { state: arrivalState, refresh: refreshArrival, markResolved } = useArrivalPrompt(!!staff, arrivalDialogOpen || eodActive);

  // Periodic timer reconciliation against server.
  const { staleTimers, dismissStale } = useTimerReconciliation(!!staff);
  const [staleDialogOpen, setStaleDialogOpen] = useState(false);

  // Proactive workday assistant — silenced while another critical UI is up.
  const { decision: assistantDecision, acknowledge: ackAssistant } = useWorkDayAssistant({
    enabled: !!staff,
    latestPosition,
    activeTimers: activeTimersForAssistant,
    isTravelling: travelState.isMoving,
    isQuiet: arrivalDialogOpen || staleDialogOpen || !!completedTravel,
  });

  // End-day-on-arrival-home — quiet suggestion when a trip ends inside the
  // silently-inferred home location and a workplace timer is still open.
  const { suggestion: endDayHomeSuggestion, dismissSuggestion: dismissEndDayHome, acceptSuggestion: acceptEndDayHome } =
    useEndDayOnArrivalHome(completedTravel, activeTimersForAssistant);

  // ── AUTO-FIRST WIRING (2026-04) ────────────────────────────────────
  // Registrera auto-start (tryStartFromArrival) + auto-stop (stopSession)
  // som modul-globala callbacks som useGeofencing kallar i ENTER/EXIT.
  // Utan denna registrering faller geofence tillbaka på prompt-flödet.
  //
  // STOP-AT-TIME-OF-EXIT (2026-04 fix):
  //   `activeTimersForAssistant` är en cached snapshot som uppdateras via
  //   event + 15s-poll och kan vara stale när EXIT triggar. För att stoppa
  //   rätt timer läser vi FRESH state direkt från localStorage vid stop-
  //   tillfället. Vi har också en lokal in-flight-set som dedupar parallella
  //   exit-events för samma key.
  const stopInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!staff) return;
    const readFreshTimers = (): Map<string, ActiveTimer> => {
      try {
        const raw = localStorage.getItem('eventflow-mobile-timers');
        return new Map(raw ? JSON.parse(raw) : []);
      } catch {
        return new Map();
      }
    };
    const dispose = registerGeofenceAutoActions({
      start: async ({ kind, targetId, label, arrivedAtIso }) => {
        const workTarget: WorkTarget | null =
          kind === 'location' ? { kind: 'location', locationId: targetId, name: label }
          : kind === 'project' ? { kind: 'project', largeProjectId: targetId, name: label }
          : { kind: 'booking', bookingId: targetId, client: label };
        if (!workTarget) return { status: 'workday_failed' };
        // Använd första stabila GPS-arrival som starttid — inte "nu" när
        // appen råkade synca. Skickas vidare som startedAtIso → workday
        // och time_report ärver den faktiska ankomsttiden.
        const status = await tryStartFromArrival(workTarget, {
          startedAtIso: arrivedAtIso,
          label,
          suppressToast: true,
        });
        if (status === 'started' || status === 'already_running') {
          window.dispatchEvent(new CustomEvent('auto-arrival-started', {
            detail: { kind, targetId, label, arrivedAtIso, workTarget },
          }));
        } else if (status === 'workday_failed' || status === 'start_failed') {
          // Workday får inte blockeras pga aktivitet — se till att dagen
          // ändå öppnas och flagga att aktivitet saknas.
          try {
            const wd = await ensureWorkDayActive(arrivedAtIso);
            if (wd) {
              toast.message('Arbetsdag startad — välj projekt/plats för aktivitet');
              window.dispatchEvent(new CustomEvent('auto-arrival-workday-only', {
                detail: { kind, targetId, label, arrivedAtIso },
              }));
              void mobileApi.createWorkdayFlag({
                flag_type: 'unclear_start_target',
                flag_date: arrivedAtIso.slice(0, 10),
                title: `Auto-start: aktivitet saknas (${label})`,
                description: `Arbetsdag startades automatiskt vid ankomst till ${label} men aktivitetstimer kunde inte startas.`,
                severity: 'warning',
                needs_user_input: true,
                related_booking_id: kind === 'booking' ? targetId : undefined,
                related_large_project_id: kind === 'project' ? targetId : undefined,
                related_location_id: kind === 'location' ? targetId : undefined,
                context: { source: 'geofence_auto_arrival', arrived_at: arrivedAtIso },
              }).catch(() => {});
            }
          } catch (err) {
            console.warn('[AutoArrival] workday fallback failed:', err);
          }
        }
        return { status };
      },
      stop: async ({ key, exitedAtIso }) => {
        // Dedupe: ignorera om ett stop för samma key redan är pågående.
        if (stopInFlightRef.current.has(key)) {
          console.log('[GeofenceAutoStop] skip — already in flight', { key });
          return;
        }
        // Läs FRESH timer-state vid stop-tillfället, inte snapshot.
        const fresh = readFreshTimers();
        const t = fresh.get(key);
        if (!t) {
          console.log('[GeofenceAutoStop] skip — no active timer for key', { key });
          return;
        }
        stopInFlightRef.current.add(key);
        try {
          const target = timerToTarget(key, t);
          await stopSession(target, { stopAtIso: exitedAtIso });
        } finally {
          stopInFlightRef.current.delete(key);
        }
      },
    });
    return dispose;
  }, [staff, tryStartFromArrival, stopSession, ensureWorkDayActive]);

  // Smart-karta — öppet "tid på plats" besök efter accept av Scenario A
  const { visit: unplannedVisit, end: endUnplannedVisit, start: startUnplannedVisit } =
    useUnplannedSiteVisit(latestPosition);

  // Last-shift-end prompt — when staff exits a geofence that maps to today's
  // final planned shift, ask if they want to end the day. Travel timer still
  // starts as usual (handled by useTravelDetection).
  const {
    exitContext: lastShiftExit,
    dismiss: dismissLastShift,
    snooze: snoozeLastShift,
  } = useLastShiftEndDetection(!!staff);

  // Stale-day correction — server cron flagged a forgotten timer overnight;
  // ask the user to confirm/correct the actual end-of-day time.
  const staleDay = useStaleDayCorrection(!!staff);

  const arrivalTarget: ArrivalTarget | null = arrivalState?.target ?? null;
  const plannedArrivalTarget = arrivalTarget && isArrivalTargetPlannedToday(arrivalTarget, bookings)
    ? arrivalTarget
    : null;

  useEffect(() => {
    if (eodActive) return;
    if (arrivalState?.should_prompt && plannedArrivalTarget) {
      setArrivalDialogOpen(true);
    } else if (!plannedArrivalTarget) {
      setArrivalDialogOpen(false);
    }
  }, [arrivalState?.should_prompt, plannedArrivalTarget, eodActive]);

  /**
   * Map an ArrivalTarget → WorkTarget. The WorkSession engine is what
   * actually creates the timer/server entry, so the arrival flow is
   * IDENTICAL for location/project/booking — only the target shape differs.
   */
  const arrivalToWorkTarget = useCallback((t: ArrivalTarget): WorkTarget | null => {
    if (t.kind === 'location') {
      return { kind: 'location', locationId: t.target_id, name: t.label };
    }
    if (t.kind === 'project') {
      return { kind: 'project', largeProjectId: t.target_id, name: t.label };
    }
    if (t.kind === 'booking') {
      return { kind: 'booking', bookingId: t.target_id, client: t.label };
    }
    return null;
  }, []);

  /**
   * Vänta tills en specifik timer dyker upp i providerns activeTimers.
   * Provider uppdateras synkront via timer-state-changed events från
   * useGeofencing → vanligtvis 0–50 ms latency. Vi pollar 100 ms upp till
   * 2 s som säkerhetsnät innan vi rapporterar att arrival inte tog.
   */
  const waitForProviderTimer = useCallback(async (key: string, timeoutMs = 2000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (providerActiveTimers.has(key)) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return providerActiveTimers.has(key);
  }, [providerActiveTimers]);

  /**
   * Vänta tills useWorkDay rapporterar en aktiv (öppen) workday. Försöker
   * först cache, sedan refresh, sedan poll med kort timeout som säkerhetsnät.
   */
  const waitForActiveWorkday = useCallback(async (timeoutMs = 2500): Promise<boolean> => {
    const isOpen = () => {
      const wd = currentWorkdayRef.current;
      return !!wd && !wd.ended_at;
    };
    if (isOpen()) return true;
    // Tryck igång en refresh för att ta server-truth direkt.
    try { await refreshWorkday(); } catch { /* non-fatal */ }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isOpen()) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return isOpen();
  }, [refreshWorkday]);

  const handleArrivalConfirm = useCallback(async (result: { startedAtIso: string; usedSuggestedArrival: boolean }) => {
    if (!plannedArrivalTarget) return;
    setArrivalSubmitting(true);
    try {
      const startedAt = result.usedSuggestedArrival ? plannedArrivalTarget.arrived_at : result.startedAtIso;
      const workTarget = arrivalToWorkTarget(plannedArrivalTarget);
      if (!workTarget) throw new Error('Unknown arrival type');

      const targetKey = resolveTargetKey(workTarget);
      const projectLabel = plannedArrivalTarget.label || 'aktiviteten';
      const arrivalHHmm = (() => {
        try { return format(parseISO(startedAt), 'HH:mm'); } catch { return null; }
      })();

      // suppressToast=true → vi visar egen, mer detaljerad feedback nedan
      // istället för den generiska "Timer startad: …" från performStart.
      const status = await tryStartFromArrival(workTarget, {
        startedAtIso: startedAt,
        suppressToast: true,
      });

      if (status === 'already_running') {
        // Även här verifierar vi att workday faktiskt är öppen — annars är
        // det inkonsekvent state och vi vill att användaren ska se det.
        const dayOpen = await waitForActiveWorkday();
        if (!dayOpen) {
          toast.error('Aktiviteten är aktiv men arbetsdagen syns inte. Försök igen.');
          return;
        }
        toast.message(`${projectLabel} är redan aktivt`);
        await markResolved(plannedArrivalTarget);
        setArrivalDialogOpen(false);
        refreshArrival();
        return;
      }

      if (status === 'started') {
        // Verifiera BÅDE workday och activity-timer innan prompten släpps.
        // Om någon saknas → lämna oresolvad så användaren kan retrya.
        const [seen, dayOpen] = await Promise.all([
          waitForProviderTimer(targetKey),
          waitForActiveWorkday(),
        ]);
        if (!seen && !dayOpen) {
          toast.error('Start kunde inte verifieras. Försök igen om en stund.');
          return;
        }
        if (!dayOpen) {
          toast.error('Aktiviteten startades men arbetsdagen syns inte ännu. Försök igen.');
          return;
        }
        if (!seen) {
          toast.error('Arbetsdagen är aktiv men aktivitetstimern syns inte ännu. Försök igen.');
          return;
        }
        if (arrivalHHmm) {
          toast.success(`Arbetsdag startad från ${arrivalHHmm}`);
        }
        toast.success(`${projectLabel} är aktivt`);
        await markResolved(plannedArrivalTarget);
        setArrivalDialogOpen(false);
        refreshArrival();
        return;
      }

      if (status === 'conflict') {
        // TimerConflictDialog är öppen. Lämna prompten öppen så användaren
        // inte tror att timern startade.
        return;
      }

      // 'workday_failed' / 'start_failed' — performStart har redan visat
      // toast.error. Lämna prompten oresolvad för retry.
      if (status === 'workday_failed' || status === 'start_failed') {
        return;
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte starta aktiviteten');
    } finally {
      setArrivalSubmitting(false);
    }
  }, [plannedArrivalTarget, arrivalToWorkTarget, tryStartFromArrival, markResolved, refreshArrival, waitForProviderTimer, waitForActiveWorkday]);

  const handleArrivalDismiss = useCallback(async () => {
    if (!plannedArrivalTarget) return;
    await markResolved(plannedArrivalTarget);
    setArrivalDialogOpen(false);
  }, [plannedArrivalTarget, markResolved]);

  useEffect(() => {
    if (staleTimers.length > 0 && !eodActive && !arrivalDialogOpen) {
      setStaleDialogOpen(true);
    } else if (staleTimers.length === 0) {
      setStaleDialogOpen(false);
    }
  }, [staleTimers.length, eodActive, arrivalDialogOpen]);

  const handleStaleSave = useCallback(async (key: string) => {
    const entry = staleTimers.find((s) => s.key === key);
    if (!entry) return;
    try {
      const stopTime = new Date();
      const startTime = new Date(entry.timer.startTime);
      // Midnight-cap any pass that has been open longer than 24h so we
      // never accidentally write a multi-day report.
      const cappedStop = stopTime.getTime() - startTime.getTime() > 24 * 3600 * 1000
        ? new Date(startTime.getTime() + 24 * 3600 * 1000)
        : stopTime;

      // Route through the unified stop engine. This guarantees:
      //  • single owner of time_reports (mobile-app-api.createTimeReport)
      //  • correct time_report_id linkage on the anomaly (handled inside
      //    stopSession via the saveAndStopTimer return shape)
      //  • location_id / booking_id / large_project_id mapped via
      //    timerToTarget — no stale stringly-typed `key.startsWith(...)`.
      const target = timerToTarget(key, entry.timer);
      const result = await stopSession(target, {
        stopAtIso: cappedStop.toISOString(),
        breakChoice: { kind: 'no_break' },
        endOfDayContext: {
          lastExitIso: startTime.toISOString(),
          endedAtIso: cappedStop.toISOString(),
          workDescription:
            'Restored timer (stale) — break and end time need verification',
        },
      });

      if (result.cancelled) return;
      dismissStale(key);
      toast.success('Tidrapport sparad och timer rensad — markerad som avvikelse för uppföljning');
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte spara tidrapport');
    }
  }, [staleTimers, dismissStale, stopSession]);

  const handleStaleDiscard = useCallback(async (key: string) => {
    const entry = staleTimers.find((s) => s.key === key);
    if (entry?.timer.locationId) {
      try { await mobileApi.stopLocationTimer({ location_id: entry.timer.locationId }); } catch {}
    }
    dismissStale(key);
    toast.message('Timer kastad');
  }, [staleTimers, dismissStale]);

  // Prefetch inbox so it's cached before the user opens it.
  useEffect(() => {
    if (staff) {
      queryClient.prefetchQuery({
        queryKey: ['mobile-inbox-all'],
        queryFn: () => mobileApi.getInboxAll(),
        staleTime: 30_000,
      });
    }
  }, [staff, queryClient]);

  return (
    <>
      {/* Visual banners — render at mount position in the JSX tree */}
      <GlobalActiveTimerBanner />
      <AutoArrivalNotice />
      <TravelBanner travelState={travelState} elapsedSeconds={elapsedSeconds} onStop={manualStopTravel} />
      {unplannedVisit && <UnplannedVisitBanner visit={unplannedVisit} onEnd={endUnplannedVisit} />}

      {/* Portaled dialogs */}
      {completedTravel && !completedTravel.autoFlow && (
        <TravelCompletedDialog
          info={completedTravel}
          onDismiss={dismissCompletedTravel}
          onAcceptedVisit={startUnplannedVisit}
        />
      )}

      {arrivalState?.should_prompt && plannedArrivalTarget && (
        <UnifiedArrivalPrompt
          open={arrivalDialogOpen}
          onOpenChange={setArrivalDialogOpen}
          target={plannedArrivalTarget}
          onConfirm={handleArrivalConfirm}
          onDismiss={handleArrivalDismiss}
        />
      )}

      <StaleTimerDialog
        open={staleDialogOpen && staleTimers.length > 0}
        staleTimers={staleTimers}
        onSaveAndClose={handleStaleSave}
        onDiscard={handleStaleDiscard}
        onClose={() => setStaleDialogOpen(false)}
      />

      {/* Unified conflict + distance dialogs for arrival-driven starts */}
      <TimerConflictDialog
        open={!!conflictEval}
        evaluation={conflictEval}
        newTargetLabel={pendingLabel}
        onCancel={cancelConflict}
        onSwitch={confirmSwitch}
      />
      <DistanceWarningDialog
        open={!!distanceWarning}
        onOpenChange={(open) => { if (!open) dismissDistanceWarning(); }}
        placeName={distanceWarning?.placeName || ''}
        distanceMeters={distanceWarning?.distance || 0}
        onConfirm={async (reason) => {
          if (!distanceWarning) return false;
          const status = await distanceWarning.onConfirm(reason);
          const ok = status === 'started' || status === 'already_running';
          if (ok) dismissDistanceWarning();
          return ok;
        }}
      />

      <WorkDayAssistant decision={assistantDecision} onAcknowledge={ackAssistant} />

      {endDayHomeSuggestion && !arrivalDialogOpen && !staleDialogOpen && (
        <EndDayOnArrivalHomeDialog
          suggestion={endDayHomeSuggestion}
          onAccept={acceptEndDayHome}
          onDismiss={dismissEndDayHome}
        />
      )}

      {lastShiftExit && !arrivalDialogOpen && !staleDialogOpen && !endDayHomeSuggestion && (
        <LastShiftEndPrompt
          context={lastShiftExit}
          latestPosition={latestPosition}
          onDismiss={dismissLastShift}
          onSnooze={snoozeLastShift}
        />
      )}

      {staleDay.pending && (
        <StaleDayCorrectionDialog
          open={!!staleDay.pending}
          flagId={staleDay.pending.flag.id}
          flagDate={staleDay.pending.flag.flag_date}
          provisionalEndIso={staleDay.pending.provisionalEndIso}
          suggestions={staleDay.pending.suggestions}
          submitting={staleDay.submitting}
          onConfirm={staleDay.confirm}
          onDismiss={staleDay.dismiss}
        />
      )}

      {/* Break-decision dialog used by stopSession (incl. stale-save flow). */}
      {workSessionDialogs}
    </>
  );
};

export default MobileGlobalOverlays;
