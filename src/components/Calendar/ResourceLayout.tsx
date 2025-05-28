
import React from 'react';

interface ResourceLayoutProps {
  children: React.ReactNode;
  showStaffDisplay: boolean;
  staffDisplay: React.ReactNode;
  isMobile: boolean;
}

const ResourceLayout: React.FC<ResourceLayoutProps> = ({
  children,
  showStaffDisplay,
  staffDisplay,
  isMobile
}) => {
  return (
    <div className="flex h-full w-full">
      {/* Main content area */}
      <div className={`flex flex-col ${showStaffDisplay ? 'flex-1' : 'w-full'} h-full`}>
        <div className="flex-1 flex flex-col overflow-hidden p-2">
          {children}
        </div>
      </div>
      
      {/* Staff display panel */}
      {showStaffDisplay && (
        <div className="w-80 border-l bg-gray-50 flex-shrink-0 h-full overflow-y-auto">
          {staffDisplay}
        </div>
      )}
    </div>
  );
};

export default ResourceLayout;
