import React from 'react';
import { Sidebar3D } from '@/components/Sidebar3D';

interface MainSystemLayoutProps {
  children: React.ReactNode;
}

const MainSystemLayout: React.FC<MainSystemLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex">
      <Sidebar3D />
      {/* Main content with left margin for sidebar */}
      <main className="flex-1 md:ml-64 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
};

export default MainSystemLayout;
