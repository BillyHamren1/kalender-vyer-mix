import React from 'react';
import { Sidebar3D } from '@/components/Sidebar3D';

interface MainSystemLayoutProps {
  children: React.ReactNode;
}

const MainSystemLayout: React.FC<MainSystemLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar3D />
      {/* Main content - sidebar takes space in layout (no reserved margin) */}
      <main className="flex-1 pb-20 md:pb-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export default MainSystemLayout;
