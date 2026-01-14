import React from 'react';
import GlobalTopBar from '@/components/GlobalTopBar';

interface MainSystemLayoutProps {
  children: React.ReactNode;
}

const MainSystemLayout: React.FC<MainSystemLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <GlobalTopBar />
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
};

export default MainSystemLayout;
