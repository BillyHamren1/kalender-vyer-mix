import React, { useEffect, useState, useCallback } from 'react';
import MobileBottomNav from './MobileBottomNav';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
import GlobalActiveTimerBanner from './GlobalActiveTimerBanner';
import ArrivalPromptDialog from './ArrivalPromptDialog';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { useArrivalPrompt } from '@/hooks/useArrivalPrompt';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { format, parseISO, differenceInSeconds } from 'date-fns';
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

  // Arrival prompt — same source-of-truth used by push-cron
  const { state: arrivalState, refresh: refreshArrival, markResolved } = useArrivalPrompt(!!staff);
  const [arrivalDialogOpen, setArrivalDialogOpen] = useState(false);
  const [arrivalSubmitting, setArrivalSubmitting] = useState(false);

  useEffect(() => {
    if (arrivalState?.should_prompt && arrivalState.location_id && arrivalState.arrived_at) {
      setArrivalDialogOpen(true);
    } else {
      setArrivalDialogOpen(false);
    }
  }, [arrivalState?.should_prompt, arrivalState?.location_id, arrivalState?.arrived_at]);

  const handleArrivalConfirm = useCallback(async (result: { startedAtIso: string; usedSuggestedArrival: boolean }) => {
    if (!arrivalState?.location_id || !arrivalState.arrived_at) return;
    setArrivalSubmitting(true);
    try {
      // Use suggested arrival time, or user-picked custom time
      const startedAt = result.usedSuggestedArrival ? arrivalState.arrived_at : result.startedAtIso;
      await mobileApi.startLocationTimer(arrivalState.location_id, undefined, startedAt);

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

      <MobileBottomNav />
    </div>
  );
};

export default MobileAppLayout;
