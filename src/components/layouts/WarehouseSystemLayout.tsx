import React from 'react';
import { WarehouseSidebar3D } from '@/components/WarehouseSidebar3D';

interface WarehouseSystemLayoutProps {
  children: React.ReactNode;
}

const WarehouseSystemLayout: React.FC<WarehouseSystemLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex">
      <WarehouseSidebar3D />
      {/* Main content with left margin for sidebar */}
      <main className="flex-1 md:ml-64 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
};

export default WarehouseSystemLayout;
