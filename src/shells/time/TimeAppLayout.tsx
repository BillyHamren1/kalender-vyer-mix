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
      {/* Content area — bottom padding = nav height (68px) + safe area inset */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 8px))' }}
      >
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default TimeAppLayout;
