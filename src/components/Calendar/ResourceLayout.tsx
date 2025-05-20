
import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Resource } from './ResourceData';

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
          {/* Children contains header and navigation */}
          {children}

          {/* Two-column layout for staff and calendar - Use grid or flex based on screen size */}
          <div className={`${isMobile ? 'flex flex-col' : 'grid'}`} 
               style={{ gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: '1rem' }}>
            
            {/* Left column: Available Staff Display */}
            {showStaffDisplay && (
              <div className={`${isMobile ? 'mb-4' : ''}`} style={{ marginTop: '39px' }}>
                {staffDisplay}
              </div>
            )}
            
            {/* Right column: Calendar */}
            <div className="flex-grow">
              {/* Calendar will be rendered here */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceLayout;
