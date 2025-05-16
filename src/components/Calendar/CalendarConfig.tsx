
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
    height: "auto", // Set to auto to respect container
    slotMinTime: "00:00:00",
    slotMaxTime: "24:00:00",
    scrollTime: "07:00:00",
    slotDuration: "01:00:00", // Changed from 30 minutes to 1 hour
    slotLabelInterval: "01:00", // Keep at 1 hour
    allDaySlot: false,
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
