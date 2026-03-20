import React from 'react';
import MobileBottomNav from '@/components/mobile-app/MobileBottomNav';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';

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
  useBackgroundLocationReporter(staff?.id);
  return (
    <div className="min-h-screen bg-card flex flex-col max-w-lg mx-auto">
      {/* Content area — bottom padding = nav height (68px) + safe area inset + extra buffer */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default TimeAppLayout;
