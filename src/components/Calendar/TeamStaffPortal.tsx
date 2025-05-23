
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus } from 'lucide-react';

interface TeamStaffPortalProps {
  resourceElement: HTMLElement | null;
  resourceId: string;
  resourceTitle: string;
  onSelectStaff: (resourceId: string, resourceTitle: string) => void;
}

const TeamStaffPortal: React.FC<TeamStaffPortalProps> = ({
  resourceElement,
  resourceId,
  resourceTitle,
  onSelectStaff
}) => {
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const portalRoot = document.body;
  
  // Calculate and update button position based on resource element position
  const updatePosition = () => {
    if (!resourceElement) return;
    
    const rect = resourceElement.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    
    // Position in the top right corner of the resource header
    setPosition({
      top: rect.top + scrollTop + 5, // 5px padding from top
      right: window.innerWidth - (rect.right + scrollLeft) + 5 // 5px from right edge
    });
  };
  
  // Update position on mount and window resize
  useEffect(() => {
    updatePosition();
    
    const handleResize = () => {
      updatePosition();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);
    
    // Check for position changes periodically (calendar might resize dynamically)
    const intervalId = setInterval(updatePosition, 500);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
      clearInterval(intervalId);
    };
  }, [resourceElement]);
  
  // Handle click to select staff
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    }
  };
  
  if (!resourceElement) return null;
  
  // Portal the button to body to escape FullCalendar's DOM structure
  return createPortal(
    <button
      ref={buttonRef}
      onClick={handleClick}
      className="team-staff-portal-button"
      title={`Assign staff to ${resourceTitle}`}
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        right: `${position.right}px`,
        zIndex: 1000,
        height: '20px',
        width: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed #d1d5db',
        borderRadius: '0.25rem',
        backgroundColor: 'white',
        padding: '3px',
        transition: 'all 0.2s ease'
      }}
    >
      <UserPlus className="h-3 w-3 text-gray-500" />
    </button>,
    portalRoot
  );
};

export default TeamStaffPortal;
