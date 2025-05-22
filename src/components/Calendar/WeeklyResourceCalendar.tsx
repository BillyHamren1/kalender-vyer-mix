
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
      resourceAreaWidth: '130px',             // Increased from 120px to 130px
      resourceLabelText: 'Teams',             // Header text for resource area
      resourceAreaHeaderContent: 'Teams',     // Alternative way to set header text
      stickyResourceAreaHeaders: true,        // Keep resource headers visible during scroll
      resourceOrder: 'title',                 // Order resources by title
      resourcesInitiallyExpanded: true,       // Ensure resources are expanded initially
      slotMinWidth: '130px',                  // Increased from 120px to 130px
      // Enhanced styling for weekly view
      resourceLabelClassNames: 'text-center flex justify-center items-center w-full'
    };
  };

  // Common calendar props to ensure consistency across all day calendars
  const getCommonCalendarProps = () => {
    return {
      height: 'auto',
      headerToolbar: false,             // Hide the header to save space
      allDaySlot: false,                // Hide all-day slot to save space
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: '130px',       // Increased from 120px to 130px
      slotMinWidth: '130px',            // Increased from 120px to 130px
      slotDuration: '01:00:00',         // 1-hour slots to reduce vertical space
      resourceAreaColumns: [            // Configure resource column display
        {
          field: 'title',
          headerContent: 'Teams',
          width: '130px',               // Increased from 120px to 130px
          className: 'text-center'       // Add center alignment
        }
      ],
      ...getResourceTimeGridOptions(),   // Add additional resource grid options
      // Critical fix: Force all resource headers to use center alignment
      resourceLabelClassNames: 'text-center flex justify-center items-center w-full',
      // Fix resource header cell centering
      resourceLabelDidMount: (info: any) => {
        // Ensure elements are properly cast to HTMLElement for TypeScript
        const headerEl = info.el as HTMLElement;
        headerEl.style.display = 'flex';
        headerEl.style.flexDirection = 'column';
        headerEl.style.alignItems = 'center';
        headerEl.style.justifyContent = 'center';
        headerEl.style.width = '100%';
        headerEl.style.textAlign = 'center';
        
        // Also fix cell cushion
        const cushion = info.el.querySelector('.fc-datagrid-cell-cushion');
        if (cushion) {
          const cushionEl = cushion as HTMLElement;
          cushionEl.style.width = '100%';
          cushionEl.style.textAlign = 'center';
        }
        
        // Fix cell main
        const cellMain = info.el.closest('.fc-datagrid-cell-main');
        if (cellMain) {
          const cellMainEl = cellMain as HTMLElement;
          cellMainEl.style.display = 'flex';
          cellMainEl.style.flexDirection = 'column';
          cellMainEl.style.alignItems = 'center';
          cellMainEl.style.justifyContent = 'center';
          cellMainEl.style.width = '100%';
          cellMainEl.style.textAlign = 'center';
        }
      }
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
                  ...getCommonCalendarProps(),  // Use common props for consistency
                  // Critical fix: Add these overrides to fix centering
                  dayCellClassNames: 'text-center',
                  resourceAreaClassNames: 'flex justify-center items-center w-full text-center'
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
