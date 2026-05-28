import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar3D } from '@/components/Sidebar3D';
import { PinnedTabsProvider } from '@/contexts/PinnedTabsContext';
import { PinnedTabsRail } from '@/components/PinnedTabsRail';

interface MainSystemLayoutProps {
  children?: React.ReactNode;
}

/**
 * FloatingInbox borttaget per användarens önskemål 2026-05-23.
 * PinnedTabsRail lagt till på höger sida 2026-05-28 — högerklicka i sidebar
 * för "Spara som tabb" och behåll snabblänkar mellan sidor.
 */
const MainSystemLayout: React.FC<MainSystemLayoutProps> = ({ children }) => {
  return (
    <PinnedTabsProvider>
      <div className="h-screen flex overflow-hidden">
        <Sidebar3D />
        <main className="flex-1 pb-20 lg:pb-0 flex flex-col overflow-y-auto">
          {children ?? <Outlet />}
        </main>
        <PinnedTabsRail />
      </div>
    </PinnedTabsProvider>
  );
};

export default MainSystemLayout;
