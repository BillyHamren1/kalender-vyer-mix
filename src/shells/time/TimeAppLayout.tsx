import React from 'react';
import MobileBottomNav from '@/components/mobile-app/MobileBottomNav';

interface TimeAppLayoutProps {
  children: React.ReactNode;
}

/**
 * TimeAppLayout — the native shell for EventFlow Time.
 * Wraps content with a time-focused bottom navigation.
 * Uses the existing MobileBottomNav which already has the correct Time tabs.
 */
const TimeAppLayout: React.FC<TimeAppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-card flex flex-col max-w-lg mx-auto">
      <div className="flex-1 pb-[76px] overflow-y-auto">
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default TimeAppLayout;
