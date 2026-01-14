import React from 'react';
import WarehouseTopBar from '@/components/WarehouseTopBar';

interface WarehouseSystemLayoutProps {
  children: React.ReactNode;
}

const WarehouseSystemLayout: React.FC<WarehouseSystemLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <WarehouseTopBar />
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
};

export default WarehouseSystemLayout;
