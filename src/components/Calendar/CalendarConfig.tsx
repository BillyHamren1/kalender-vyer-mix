
import React from 'react';

// Calendar view configuration
export const getCalendarViews = () => {
  return {
    resourceTimeGridDay: {
      type: 'resourceTimeGrid',
      duration: { days: 1 }
    },
    timeGridWeek: {
      type: 'timeGrid',
      duration: { weeks: 1 }
    },
    dayGridMonth: {
      type: 'dayGrid',
      duration: { months: 1 }
    }
  };
};

// Calendar options - FIXED to use full 24-hour range
export const getCalendarOptions = () => {
  return {
    height: "auto",
    slotMinTime: "00:00:00", // Allow events from midnight
    slotMaxTime: "24:00:00", // Allow events until midnight next day
    scrollTime: "06:00:00", // Start view at 6 AM for convenience
    slotDuration: "01:00:00", // One hour per slot
    slotLabelInterval: "01:00", // Keep at 1 hour
    allDaySlot: false,
    slotLabelFormat: {
      hour: "2-digit" as "2-digit", 
      minute: "2-digit" as "2-digit",
      hour12: false,   // Use 24-hour format
      omitZeroMinute: false // Always show minutes even if 00
    }
  };
};

// Header toolbar configuration
export const getHeaderToolbar = () => {
  return {
    left: 'prev,next today',
    center: 'title',
    right: 'resourceTimeGridDay,timeGridWeek,dayGridMonth'
  };
};

// This component doesn't render anything, it's just a utility
const CalendarConfig: React.FC = () => null;

export default CalendarConfig;
