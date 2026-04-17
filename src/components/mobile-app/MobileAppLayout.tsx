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

      <MobileBottomNav />
    </div>
  );
};

export default MobileAppLayout;
