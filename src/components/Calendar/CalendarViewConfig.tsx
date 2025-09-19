
import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

export const useCalendarView = () => {
  const isMobile = useIsMobile();
  
  // Get appropriate initial view based on screen size
  const getInitialView = () => {
    return isMobile ? "timeGridDay" : "resourceTimeGridDay";
  };

  // Get appropriate header toolbar based on screen size
  const getMobileHeaderToolbar = () => {
    if (isMobile) {
      return {
        left: 'prev,next',
        center: 'title',
        right: 'timeGridDay,dayGridMonth'
      };
    }
    return {
      left: 'prev,next today',
      center: 'title',
      right: 'resourceTimeGridDay,resourceTimeGridWeek,timeGridWeek,dayGridMonth'
    };
  };
  
  // Configure aspect ratio based on screen size
  const getAspectRatio = () => {
    return isMobile ? 0.8 : 1.8;
  };
  
  return {
    getInitialView,
    getMobileHeaderToolbar,
    getAspectRatio,
    isMobile
  };
};

// This component doesn't render anything, it's just a utility
const CalendarViewConfig: React.FC = () => null;

export default CalendarViewConfig;
