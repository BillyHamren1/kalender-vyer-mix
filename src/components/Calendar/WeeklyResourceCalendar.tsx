
import React, { useEffect, useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, addDays } from 'date-fns';
import './WeeklyCalendarStyles.css';

interface WeeklyResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean;
}

const WeeklyResourceCalendar: React.FC<WeeklyResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  refreshEvents,
  onStaffDrop,
  forceRefresh
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Generate an array of 7 days starting from currentDate
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() + i);
    return date;
  });

  // Handle calendar date set for nested calendars
  const handleNestedCalendarDateSet = (dateInfo: any) => {
    // Only pass the date to the parent if it's from the first calendar
    // This prevents multiple triggers from all 7 calendars
    if (dateInfo.view.calendar.el.getAttribute('data-day-index') === '0') {
      onDateSet(dateInfo);
    }
  };
  
  // Helper function to ensure consistent resource column configuration
  const getResourceTimeGridOptions = () => {
    return {
      resourceAreaWidth: '120px',             // Increased from 70px to 120px
      resourceLabelText: 'Teams',             // Header text for resource area
      resourceAreaHeaderContent: 'Teams',     // Alternative way to set header text
      stickyResourceAreaHeaders: true,        // Keep resource headers visible during scroll
      resourceOrder: 'title',                 // Order resources by title
      resourcesInitiallyExpanded: true,       // Ensure resources are expanded initially
      slotMinWidth: '120px'                   // Increased from 70px to 120px
    };
  };

  // Common calendar props to ensure consistency across all day calendars
  const getCommonCalendarProps = () => {
    return {
      height: 'auto',
      headerToolbar: false,             // Hide the header to save space
      allDaySlot: false,                // Hide all-day slot to save space
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: '120px',       // Increased from 70px to 120px
      slotMinWidth: '120px',            // Increased from 70px to 120px
      slotDuration: '01:00:00',         // 1-hour slots to reduce vertical space
      resourceAreaColumns: [            // Configure resource column display
        {
          field: 'title',
          headerContent: 'Teams',
          width: '120px'                // Increased from 70px to 120px
        }
      ],
      ...getResourceTimeGridOptions()   // Add additional resource grid options
    };
  };

  // Scroll to start of container when component mounts or updates
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  }, [currentDate]);

  return (
    <div className="weekly-view-container">
      <div className="weekly-calendar-container" ref={containerRef}>
        {weekDays.map((date, index) => (
          <div key={format(date, 'yyyy-MM-dd')} className="day-calendar-wrapper">
            <div className="day-header">
              {format(date, 'EEEE, MMM d')}
            </div>
            <div className="weekly-view-calendar">
              <ResourceCalendar
                events={events}
                resources={resources}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={date}
                onDateSet={handleNestedCalendarDateSet}
                refreshEvents={refreshEvents}
                onStaffDrop={onStaffDrop}
                forceRefresh={forceRefresh}
                key={`calendar-${format(date, 'yyyy-MM-dd')}`}
                calendarProps={{
                  'data-day-index': index.toString(),
                  ...getCommonCalendarProps()  // Use common props for consistency
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(WeeklyResourceCalendar);
