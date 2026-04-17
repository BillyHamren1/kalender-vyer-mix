import React, { useEffect } from 'react';
import MobileBottomNav from '@/components/mobile-app/MobileBottomNav';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';

interface TimeAppLayoutProps {
  children: React.ReactNode;
}

/**
 * TimeAppLayout — the native shell for EventFlow Time.
 * Wraps content with a time-focused bottom navigation.
 * Uses the existing MobileBottomNav which already has the correct Time tabs.
 * Also runs background GPS reporting for all authenticated staff.
 */
const TimeAppLayout: React.FC<TimeAppLayoutProps> = ({ children }) => {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();
  useBackgroundLocationReporter(staff?.id);

  // Prefetch inbox data at app start
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
    <div className="min-h-screen bg-card max-w-lg mx-auto">
      <div style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default TimeAppLayout;
