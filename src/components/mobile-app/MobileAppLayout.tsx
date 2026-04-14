import React, { useEffect } from 'react';
import MobileBottomNav from './MobileBottomNav';
import TravelBanner from './TravelBanner';
import TravelCompletedDialog from './TravelCompletedDialog';
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

  return (
    <div className="min-h-screen bg-card flex flex-col max-w-lg mx-auto">
      {/* Content area — bottom padding = nav height (68px) + safe area inset + extra buffer */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
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
