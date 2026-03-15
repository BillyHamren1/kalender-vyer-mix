import React from 'react';
import MobileBottomNav from './MobileBottomNav';

interface MobileAppLayoutProps {
  children: React.ReactNode;
}

const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({ children }) => {
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

export default MobileAppLayout;
