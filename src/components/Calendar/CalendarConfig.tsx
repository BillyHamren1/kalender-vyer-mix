
import React from 'react';

// Calendar view configuration
export const getCalendarViews = () => {
  return {
    resourceTimeGridDay: {
      type: 'resourceTimeGrid',
      duration: { days: 1 }
    },
    resourceTimeGridWeek: {
      type: 'resourceTimeGrid',
      duration: { weeks: 1 }
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
    slotMinTime: "05:00:00", // Start from 05:00
    slotMaxTime: "24:00:00",
    scrollTime: "05:00:00",
    slotDuration: "01:00:00",
    slotLabelInterval: "01:00",
    allDaySlot: false,
    slotLabelFormat: {
      hour: "2-digit" as "2-digit", 
      minute: "2-digit" as "2-digit",
      hour12: false,
      omitZeroMinute: false
    }
  };
};

// Header toolbar configuration
export const getHeaderToolbar = () => {
  return {
    left: 'prev,next today',
    center: 'title',
    right: 'resourceTimeGridDay,resourceTimeGridWeek,timeGridWeek,dayGridMonth'
  };
};

// This component doesn't render anything, it's just a utility
const CalendarConfig: React.FC = () => null;

export default CalendarConfig;
