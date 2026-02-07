import React from 'react';
import { WarehouseSidebar3D } from '@/components/WarehouseSidebar3D';

interface WarehouseSystemLayoutProps {
  children: React.ReactNode;
}

const WarehouseSystemLayout: React.FC<WarehouseSystemLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen flex overflow-hidden">
      <WarehouseSidebar3D />
      {/* Main content - sidebar takes space in layout (no reserved margin) */}
      <main className="flex-1 pb-20 md:pb-0 flex flex-col overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
};

export default WarehouseSystemLayout;
