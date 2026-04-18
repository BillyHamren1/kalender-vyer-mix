import React, { useEffect, useState, useCallback } from 'react';
import MobileBottomNav from './MobileBottomNav';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
import GlobalActiveTimerBanner from './GlobalActiveTimerBanner';
import ArrivalPromptDialog from './ArrivalPromptDialog';
import StaleTimerDialog from './StaleTimerDialog';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { useArrivalPrompt } from '@/hooks/useArrivalPrompt';
import { useTimerReconciliation } from '@/hooks/useTimerReconciliation';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { ActiveTimer } from '@/hooks/useGeofencing';

interface MobileAppLayoutProps {
  children: React.ReactNode;
}

const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({ children }) => {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();
  const { latestPosition } = useBackgroundLocationReporter(staff?.id);

  // Travel detection — runs globally regardless of active page
  const { travelState, elapsedSeconds, manualStopTravel, completedTravel, dismissCompletedTravel } =
    useTravelDetection(!!staff, latestPosition);

  // EOD reconciliation now runs inside useWorkSession (mounted by
  // GlobalActiveTimerBanner) and no longer persists a localStorage flag.
  // The arrival prompt suppression below uses a static `false` so it stays
  // backward-compatible while we keep the suppression hook in place.
  const eodActive = false;

  // Arrival prompt — same source-of-truth used by push-cron.
  // Pause polling while the dialog is open OR while end-of-day dialog is active.
  const [arrivalDialogOpen, setArrivalDialogOpen] = useState(false);
  const [, setArrivalSubmitting] = useState(false);
  const { state: arrivalState, refresh: refreshArrival, markResolved } = useArrivalPrompt(!!staff, arrivalDialogOpen || eodActive);

  useEffect(() => {
    if (eodActive) return; // Don't stack dialogs
    if (arrivalState?.should_prompt && arrivalState.location_id && arrivalState.arrived_at) {
      setArrivalDialogOpen(true);
    }
  }, [arrivalState?.should_prompt, arrivalState?.location_id, arrivalState?.arrived_at, eodActive]);

  const handleArrivalConfirm = useCallback(async (result: { startedAtIso: string; usedSuggestedArrival: boolean }) => {
    if (!arrivalState?.location_id || !arrivalState.arrived_at) return;
    setArrivalSubmitting(true);
    try {
      // Use suggested arrival time, or user-picked custom time
      const startedAt = result.usedSuggestedArrival ? arrivalState.arrived_at : result.startedAtIso;
      await mobileApi.startLocationTimer({ location_id: arrivalState.location_id, started_at: startedAt });

      // Optimistically reflect new timer in localStorage so banner updates immediately
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

  // Periodic timer reconciliation against server (architectural decision §1, §7).
  // Flags timers as stale instead of silently deleting; user decides via dialog.
  const { staleTimers, dismissStale } = useTimerReconciliation(!!staff);
  const [staleDialogOpen, setStaleDialogOpen] = useState(false);
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
      // Cap at 24h to avoid creating absurd reports
      const cappedStop = stopTime.getTime() - startTime.getTime() > 24 * 3600 * 1000
        ? new Date(startTime.getTime() + 24 * 3600 * 1000)
        : stopTime;
      const totalHours = (cappedStop.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      // INGEN automatisk rast — stale-recovery sparar med break=0 och flaggar
      // som anomaly så admin kan justera. Användaren kan inte längre fatta
      // beslut om ett pass som var öppet i flera timmar utan tillsyn.
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
      // Skapa avvikelse så admin kan följa upp rast/sluttid manuellt.
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

  // Prefetch inbox data at app start so it's cached before user opens inbox
  useEffect(() => {
    if (staff) {
      queryClient.prefetchQuery({
        queryKey: ['mobile-inbox-all'],
        queryFn: () => mobileApi.getInboxAll(),
        staleTime: 30_000,
      });
    }
  }, [staff, queryClient]);

  // Paint the document background teal so iOS rubber-band overscroll at the
  // top reveals the same colour as the sticky header (no white flash), and
  // disable overscroll bounce so the header doesn't get dragged away.
  useEffect(() => {
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;
    document.documentElement.style.backgroundColor = 'hsl(var(--primary))';
    document.body.style.backgroundColor = 'hsl(var(--primary))';
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => {
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.overscrollBehaviorY = prevHtmlOverscroll;
      document.body.style.overscrollBehaviorY = prevBodyOverscroll;
    };
  }, []);

  return (
    <div
      className="bg-card max-w-lg mx-auto fixed inset-0 overflow-y-auto overscroll-none"
      style={{ WebkitOverflowScrolling: 'touch' as any }}
    >
      <div style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {/* Global active timer banner — visible on all pages except /m/report */}
        <GlobalActiveTimerBanner />

        {/* Global travel banner — visible on all pages */}
        <TravelBanner travelState={travelState} elapsedSeconds={elapsedSeconds} onStop={manualStopTravel} />

        {children}
      </div>

      {/* Global travel completed dialog */}
      {completedTravel && (
        <TravelCompletedDialog info={completedTravel} onDismiss={dismissCompletedTravel} />
      )}

      {/* Global arrival prompt — shown whenever staff is at workplace without a timer */}
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

      {/* Stale timer warning — never silently delete; user must save or discard */}
      <StaleTimerDialog
        open={staleDialogOpen && staleTimers.length > 0}
        staleTimers={staleTimers}
        onSaveAndClose={handleStaleSave}
        onDiscard={handleStaleDiscard}
        onClose={() => setStaleDialogOpen(false)}
      />

      <MobileBottomNav />
    </div>
  );
};

export default MobileAppLayout;
