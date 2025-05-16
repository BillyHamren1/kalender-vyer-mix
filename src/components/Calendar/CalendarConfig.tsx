
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

// Calendar options
export const getCalendarOptions = () => {
  return {
    height: "auto",
    slotMinTime: "00:00:00",
    slotMaxTime: "24:00:00",
    scrollTime: "00:00:00", // Changed to start at midnight
    slotDuration: "01:00:00", // One hour per slot
    slotLabelInterval: "01:00", // Keep at 1 hour
    allDaySlot: false,
    slotLabelFormat: {
      hour: '2-digit', // Force 2-digit display (00, 01, 02, etc.)
      minute: '2-digit',
      hour12: false,   // Use 24-hour format
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
