import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar3D } from '@/components/Sidebar3D';

interface MainSystemLayoutProps {
  children?: React.ReactNode;
}

/**
 * FloatingInbox borttaget per användarens önskemål 2026-05-23 —
 * den flytande chattbubblan låg i vägen permanent. Inkorgen finns
 * fortfarande tillgänglig via sidopanelen (CommunicationPage).
 */
const MainSystemLayout: React.FC<MainSystemLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar3D />
      <main className="flex-1 pb-20 lg:pb-0 flex flex-col overflow-y-auto">
        {children ?? <Outlet />}
      </main>
    </div>
  );
};

export default MainSystemLayout;

