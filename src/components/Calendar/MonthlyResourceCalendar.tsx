
import React, { useEffect, useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, getDaysInMonth, startOfMonth } from 'date-fns';
import './WeeklyCalendarStyles.css';

interface MonthlyResourceCalendarProps {
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

const MonthlyResourceCalendar: React.FC<MonthlyResourceCalendarProps> = ({
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
  
  // Generate an array of all days in the month
  const monthStart = startOfMonth(currentDate);
  const daysInMonth = getDaysInMonth(currentDate);
  
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(i + 1);
    return date;
  });

  // Log staff drop operations for debugging
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    console.log(`MonthlyResourceCalendar.handleStaffDrop: staffId=${staffId}, resourceId=${resourceId || 'null'}`);
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId);
        console.log('Staff drop operation successful');
      } catch (error) {
        console.error('Error in handleStaffDrop:', error);
      }
    }
  };

  // Handle calendar date set for nested calendars
  const handleNestedCalendarDateSet = (dateInfo: any) => {
    // Only pass the date to the parent if it's from the first calendar
    // This prevents multiple triggers from all calendars
    if (dateInfo.view.calendar.el.getAttribute('data-day-index') === '0') {
      onDateSet(dateInfo);
    }
  };
  
  // Handle staff selection and pass to parent
  const handleSelectStaff = (resourceId: string, resourceTitle: string) => {
    console.log('MonthlyResourceCalendar: handleSelectStaff called for', resourceId, resourceTitle);
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    } else {
      console.error('MonthlyResourceCalendar: onSelectStaff prop is not defined');
    }
  };

  // Helper function to ensure consistent resource column configuration
  const getResourceTimeGridOptions = () => {
    return {
      resourceAreaWidth: '80px',
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: '80px'
    };
  };

  // Common calendar props to ensure consistency across all day calendars
  const getCommonCalendarProps = (dayIndex: number) => {
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: '80px',
      slotMinWidth: '80px',
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: '80px'
        }
      ],
      ...getResourceTimeGridOptions(),
      'data-day-index': dayIndex.toString(),
    };
  };

  // Filter events for each day to improve performance and visibility
  const getEventsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    return events.filter(event => {
      const eventStart = new Date(event.start);
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr;
    });
  };

  // Scroll to today when component mounts
  useEffect(() => {
    if (containerRef.current) {
      const today = new Date();
      const todayIndex = monthDays.findIndex(date => 
        format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
      );
      
      if (todayIndex >= 0) {
        // Calculate scroll position to center today
        const dayWidth = 550; // Same as weekly view
        const containerWidth = containerRef.current.clientWidth;
        const scrollPosition = (todayIndex * dayWidth) - (containerWidth / 2) + (dayWidth / 2);
        
        containerRef.current.scrollLeft = Math.max(0, scrollPosition);
      }
    }
  }, [monthDays]);

  return (
    <div className="weekly-view-container">
      <div className="weekly-calendar-container" ref={containerRef}>
        {monthDays.map((date, index) => {
          return (
            <div key={format(date, 'yyyy-MM-dd')} className="day-calendar-wrapper">
              <div className="day-header">
                {format(date, 'EEE d')}
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
                  onStaffDrop={handleStaffDrop}
                  onSelectStaff={handleSelectStaff}
                  forceRefresh={forceRefresh}
                  key={`calendar-${format(date, 'yyyy-MM-dd')}`}
                  droppableScope="monthly-calendar"
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

export default React.memo(MonthlyResourceCalendar);
