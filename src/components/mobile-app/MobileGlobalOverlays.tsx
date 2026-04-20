import React, { useEffect, useState, useCallback } from 'react';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
import GlobalActiveTimerBanner from './GlobalActiveTimerBanner';
import ArrivalPromptDialog from './ArrivalPromptDialog';
import StaleTimerDialog from './StaleTimerDialog';
import { WorkDayAssistant } from './WorkDayAssistant';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { useArrivalPrompt } from '@/hooks/useArrivalPrompt';
import { useTimerReconciliation } from '@/hooks/useTimerReconciliation';
import { useWorkDayAssistant } from '@/hooks/useWorkDayAssistant';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { ActiveTimer } from '@/hooks/useGeofencing';

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

  useEffect(() => {
    if (eodActive) return;
    if (arrivalState?.should_prompt && arrivalState.location_id && arrivalState.arrived_at) {
      setArrivalDialogOpen(true);
    }
  }, [arrivalState?.should_prompt, arrivalState?.location_id, arrivalState?.arrived_at, eodActive]);

  const handleArrivalConfirm = useCallback(async (result: { startedAtIso: string; usedSuggestedArrival: boolean }) => {
    if (!arrivalState?.location_id || !arrivalState.arrived_at) return;
    setArrivalSubmitting(true);
    try {
      const startedAt = result.usedSuggestedArrival ? arrivalState.arrived_at : result.startedAtIso;
      await mobileApi.startLocationTimer({ location_id: arrivalState.location_id, started_at: startedAt });

      try {
        const TIMERS_KEY = 'eventflow-mobile-timers';
        const raw = localStorage.getItem(TIMERS_KEY);
        const map = new Map<string, ActiveTimer>(raw ? JSON.parse(raw) : []);
        const key = `location-${arrivalState.location_id}`;
        if (!map.has(key)) {
          map.set(key, {
            startTime: startedAt,
            client: arrivalState.location_name || 'Arbetsplats',
            locationId: arrivalState.location_id,
            locationName: arrivalState.location_name || 'Arbetsplats',
            isAutoStarted: false,
          } as ActiveTimer);
          localStorage.setItem(TIMERS_KEY, JSON.stringify(Array.from(map.entries())));
          window.dispatchEvent(new Event('timer-state-changed'));
        }
      } catch {}

      await markResolved(arrivalState.location_id, arrivalState.arrived_at);
      toast.success('Timer startad');
      setArrivalDialogOpen(false);
      refreshArrival();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte starta timer');
    } finally {
      setArrivalSubmitting(false);
    }
  }, [arrivalState, markResolved, refreshArrival]);

  const handleArrivalDismiss = useCallback(async () => {
    if (!arrivalState?.location_id || !arrivalState.arrived_at) return;
    await markResolved(arrivalState.location_id, arrivalState.arrived_at);
    setArrivalDialogOpen(false);
  }, [arrivalState, markResolved]);

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
      const cappedStop = stopTime.getTime() - startTime.getTime() > 24 * 3600 * 1000
        ? new Date(startTime.getTime() + 24 * 3600 * 1000)
        : stopTime;
      const totalHours = (cappedStop.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const hoursWorked = Math.max(0, Number(totalHours.toFixed(2)));

      const tr = await mobileApi.createTimeReport({
        booking_id: key.startsWith('project-') || key.startsWith('location-') ? undefined : key,
        report_date: format(cappedStop, 'yyyy-MM-dd'),
        start_time: format(startTime, 'HH:mm'),
        end_time: format(cappedStop, 'HH:mm'),
        hours_worked: hoursWorked,
        break_time: 0,
        description: `Återställd timer: ${entry.timer.locationName || entry.timer.client}`,
        large_project_id: entry.timer.largeProjectId,
      });
      const trId = (tr as any)?.time_report?.id;
      mobileApi.createEndOfDayAnomaly({
        started_at: startTime.toISOString(),
        ended_at: cappedStop.toISOString(),
        work_description: 'Återställd timer (stale) — rast och sluttid behöver verifieras',
        location_id: entry.timer.locationId || undefined,
        booking_id: key.startsWith('project-') || key.startsWith('location-') ? undefined : key,
        large_project_id: entry.timer.largeProjectId,
        time_report_id: trId,
      }).catch(err => console.warn('Stale anomaly failed:', err));

      if (entry.timer.locationId) {
        try { await mobileApi.stopLocationTimer({ location_id: entry.timer.locationId }); } catch {}
      }
      dismissStale(key);
      toast.success('Tidrapport sparad och timer rensad — markerad som avvikelse för uppföljning');
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte spara tidrapport');
    }
  }, [staleTimers, dismissStale]);

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

      {/* Portaled dialogs */}
      {completedTravel && (
        <TravelCompletedDialog info={completedTravel} onDismiss={dismissCompletedTravel} />
      )}

      {arrivalState?.should_prompt && arrivalState.location_id && arrivalState.arrived_at && (
        <ArrivalPromptDialog
          open={arrivalDialogOpen}
          onOpenChange={setArrivalDialogOpen}
          arrivedAtIso={arrivalState.arrived_at}
          locationName={arrivalState.location_name || 'Arbetsplats'}
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

      <WorkDayAssistant decision={assistantDecision} onAcknowledge={ackAssistant} />
    </>
  );
};

export default MobileGlobalOverlays;
