
import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ResourceLayoutProps {
  children: React.ReactNode;
  staffDisplay: React.ReactNode;
  showStaffDisplay: boolean;
  isMobile: boolean;
}

/**
 * Component for laying out the resource view with responsive design
 */
const ResourceLayout: React.FC<ResourceLayoutProps> = ({ 
  children, 
  staffDisplay, 
  showStaffDisplay,
  isMobile 
}) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`container mx-auto pt-2 ${isMobile ? 'px-2' : ''}`} style={{ maxWidth: isMobile ? '100%' : '94%' }}>
        <div className={`bg-white rounded-lg shadow-md mb-4 ${isMobile ? 'p-2' : 'p-3'}`}>
          {/* Header content */}
          <div className="mb-4">
            {children}
          </div>
          
          {/* Layout container with staff on left and calendar on right */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Left column: Available Staff Display */}
            {showStaffDisplay && (
              <div className="md:w-[200px] md:flex-shrink-0 order-2 md:order-1">
                {staffDisplay}
              </div>
            )}
            
            {/* Right column: Calendar */}
            <div className="flex-grow order-1 md:order-2">
              {/* Calendar is rendered here by the parent component */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceLayout;
