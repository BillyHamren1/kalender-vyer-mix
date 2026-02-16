import React from 'react';
import MobileBottomNav from './MobileBottomNav';

interface MobileAppLayoutProps {
  children: React.ReactNode;
}

const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="flex-1 pb-[76px] overflow-y-auto">
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default MobileAppLayout;
