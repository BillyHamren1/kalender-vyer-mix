import React, { useEffect } from 'react';
import MobileBottomNav from './MobileBottomNav';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
import GlobalActiveTimerBanner from './GlobalActiveTimerBanner';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';

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
  // top reveals the same colour as the sticky header (no white flash).
  useEffect(() => {
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = 'hsl(var(--primary))';
    document.body.style.backgroundColor = 'hsl(var(--primary))';
    return () => {
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, []);

  return (
    <div className="min-h-screen bg-card max-w-lg mx-auto">
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
