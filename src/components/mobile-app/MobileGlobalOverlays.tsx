import React, { useEffect, useState, useCallback } from 'react';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
import GlobalActiveTimerBanner from './GlobalActiveTimerBanner';
import UnifiedArrivalPrompt from './UnifiedArrivalPrompt';
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
import { useWorkSession, timerToTarget, type WorkTarget } from '@/hooks/useWorkSession';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { TimerConflictDialog } from '@/components/mobile-app/TimerConflictDialog';
import DistanceWarningDialog from '@/components/mobile-app/DistanceWarningDialog';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import type { ArrivalTarget } from '@/types/arrivalTarget';

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

  // UNIFIED start flow — same conflict + distance + start machinery as
  // every other start-surface in the mobile app. Direct startSession()
  // calls from arrival flow are forbidden.
  const {
    requestStart,
    tryStartFromArrival,
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

  useEffect(() => {
    if (eodActive) return;
    if (arrivalState?.should_prompt && arrivalTarget) {
      setArrivalDialogOpen(true);
    }
  }, [arrivalState?.should_prompt, arrivalTarget, eodActive]);

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

  const handleArrivalConfirm = useCallback(async (result: { startedAtIso: string; usedSuggestedArrival: boolean }) => {
    if (!arrivalTarget) return;
    setArrivalSubmitting(true);
    try {
      const startedAt = result.usedSuggestedArrival ? arrivalTarget.arrived_at : result.startedAtIso;
      const workTarget = arrivalToWorkTarget(arrivalTarget);
      if (!workTarget) throw new Error('Unknown arrival type');

      // Arrival is a HELPER — it must only mark itself resolved if the
      // real start chain (workday-ensure + activity start) actually
      // succeeds. We use the awaitable arrival entry-point so we get the
      // true outcome, not a fire-and-forget "started".
      const status = await tryStartFromArrival(workTarget, { startedAtIso: startedAt });

      if (status === 'started' || status === 'duplicate') {
        await markResolved(arrivalTarget);
        setArrivalDialogOpen(false);
        refreshArrival();
        return;
      }

      if (status === 'conflict') {
        // TimerConflictDialog is now open. Keep the arrival prompt open
        // (do NOT mark resolved) so the user isn't tricked into thinking
        // the timer started. They can re-confirm after resolving conflict.
        return;
      }

      // 'workday-failed' — performStart already showed a toast.error.
      // Leave the arrival prompt unresolved so the user can retry.
    } catch (err: any) {
      toast.error(err?.message || 'Could not start timer');
    } finally {
      setArrivalSubmitting(false);
    }
  }, [arrivalTarget, arrivalToWorkTarget, tryStartFromArrival, markResolved, refreshArrival]);

  const handleArrivalDismiss = useCallback(async () => {
    if (!arrivalTarget) return;
    await markResolved(arrivalTarget);
    setArrivalDialogOpen(false);
  }, [arrivalTarget, markResolved]);

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

      {arrivalState?.should_prompt && arrivalTarget && (
        <UnifiedArrivalPrompt
          open={arrivalDialogOpen}
          onOpenChange={setArrivalDialogOpen}
          target={arrivalTarget}
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
        onConfirm={() => {
          distanceWarning?.onConfirm();
          dismissDistanceWarning();
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
