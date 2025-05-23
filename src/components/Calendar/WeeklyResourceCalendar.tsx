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
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
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
  onSelectStaff,
  forceRefresh
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Generate an array of 7 days starting from currentDate
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() + i);
    return date;
  });

  // Log staff drop operations for debugging
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    console.log(`WeeklyResourceCalendar.handleStaffDrop: staffId=${staffId}, resourceId=${resourceId || 'null'}`);
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId);
        console.log('Staff drop operation successful');
      } catch (error) {
        console.error('Error in handleStaffDrop:', error);
      }
    }
  };

  const handleNestedCalendarDateSet = (dateInfo: any) => {
    // Only pass the date to the parent if it's from the first calendar
    // This prevents multiple triggers from all 7 calendars
    if (dateInfo.view.calendar.el.getAttribute('data-day-index') === '0') {
      onDateSet(dateInfo);
    }
  };
  
  const handleSelectStaff = (resourceId: string, resourceTitle: string) => {
    console.log('WeeklyResourceCalendar: handleSelectStaff called for', resourceId, resourceTitle);
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    } else {
      console.error('WeeklyResourceCalendar: onSelectStaff prop is not defined');
    }
  };

  // Helper function to ensure consistent resource column configuration
  const getResourceTimeGridOptions = () => {
    return {
      resourceAreaWidth: '80px',              // Reduced from 150px to 80px
      resourceLabelText: 'Teams',             // Header text for resource area
      resourceAreaHeaderContent: 'Teams',     // Alternative way to set header text
      stickyResourceAreaHeaders: true,        // Keep resource headers visible during scroll
      resourceOrder: 'title',                 // Order resources by title
      resourcesInitiallyExpanded: true,       // Ensure resources are expanded initially
      slotMinWidth: '80px'                    // Reduced from 150px to 80px
    };
  };

  // Common calendar props to ensure consistency across all day calendars
  const getCommonCalendarProps = (dayIndex: number) => {
    return {
      height: 'auto',
      headerToolbar: false,             // Hide the header to save space
      allDaySlot: false,                // Hide all-day slot to save space
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: '80px',        // Reduced from 150px to 80px
      slotMinWidth: '80px',             // Reduced from 150px to 80px
      resourceAreaColumns: [            // Configure resource column display
        {
          field: 'title',
          headerContent: 'Teams',
          width: '80px'                 // Reduced from 150px to 80px
        }
      ],
      // Add the resource column config
      ...getResourceTimeGridOptions(),   // Add additional resource grid options
      'data-day-index': dayIndex.toString(),
    };
  };

  const getEventsForDay = (date: Date) => {
    // Format date to YYYY-MM-DD for comparison
    const dateStr = format(date, 'yyyy-MM-dd');
    
    return events.filter(event => {
      // Parse event start and end dates
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Check if the event falls on this day
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr;
    });
  };

  return (
    <div className="weekly-view-container">
      <div className="weekly-calendar-container" ref={containerRef}>
        {weekDays.map((date, index) => {
          // Get events just for this day to improve performance
          const dayEvents = getEventsForDay(date);
          
          return (
            <div key={format(date, 'yyyy-MM-dd')} className="day-calendar-wrapper">
              {/* Remove the old day header since we now have it in WeekNavigation */}
              <div className="weekly-view-calendar">
                <ResourceCalendar
                  events={events} // Use all events to ensure dragging works correctly
                  resources={resources}
                  isLoading={isLoading}
                  isMounted={isMounted}
                  currentDate={date}
                  onDateSet={handleNestedCalendarDateSet}
                  refreshEvents={refreshEvents}
                  onStaffDrop={handleStaffDrop}
                  onSelectStaff={handleSelectStaff}
                  forceRefresh={forceRefresh}
                  key={`calendar-${format(date, 'yyyy-MM-dd')}`}
                  droppableScope="weekly-calendar"
                  calendarProps={getCommonCalendarProps(index)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(WeeklyResourceCalendar);
