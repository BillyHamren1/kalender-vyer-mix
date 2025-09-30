

import React, { useEffect, useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { CalendarContext } from '@/App';
import './WeeklyCalendarStyles.css';

interface UnifiedResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string, targetDate?: Date) => void;
  forceRefresh?: number | boolean;
  viewMode: 'weekly' | 'monthly';
  staffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => any[];
  };
}

const UnifiedResourceCalendar: React.FC<UnifiedResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  refreshEvents,
  onStaffDrop,
  onSelectStaff,
  forceRefresh,
  viewMode,
  staffOperations
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setLastViewedDate } = useContext(CalendarContext);

  // Generate days based on view mode
  const getDaysToRender = () => {
    if (viewMode === 'weekly') {
      // Generate 7 days starting from currentDate
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() + i);
        return date;
      });
    } else {
      // Monthly view - generate all days in the month
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(monthStart);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
      
      return eachDayOfInterval({
        start: calendarStart,
        end: calendarEnd
      });
    }
  };

  const days = getDaysToRender();

  // Convert forceRefresh to number for consistent handling
  const numericForceRefresh = typeof forceRefresh === 'boolean' ? (forceRefresh ? 1 : 0) : (forceRefresh || 0);

  console.log(`UnifiedResourceCalendar: ${viewMode} view with ${events.length} events, forceRefresh: ${numericForceRefresh}`);

  // Calculate day width for weekly view
  const getDayWidth = () => {
    if (viewMode === 'weekly' && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dayWidth = Math.floor(containerWidth / 7);
      return dayWidth;
    }
    return 'auto';
  };

  // Handle day header click to navigate to resource view
  const handleDayHeaderClick = (date: Date) => {
    // Store the selected date in context and session storage
    setLastViewedDate(date);
    sessionStorage.setItem('calendarDate', date.toISOString());
    
    // Navigate to the resource view
    navigate('/resource-view');
  };

  // Handle staff drop - CRITICAL: Always pass the exact day date
  const handleStaffDrop = async (staffId: string, resourceId: string | null, dayDate: Date) => {
    console.log(`UnifiedResourceCalendar.handleStaffDrop: staffId=${staffId}, resourceId=${resourceId || 'null'}, date=${format(dayDate, 'yyyy-MM-dd')}`);
    
    if (onStaffDrop) {
      try {
        // IMPORTANT: Always pass the specific day date, never fallback to currentDate
        await onStaffDrop(staffId, resourceId, dayDate);
        console.log('UnifiedResourceCalendar: Staff drop operation successful for date:', format(dayDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('UnifiedResourceCalendar: Error in handleStaffDrop:', error);
      }
    }
  };

  // Handle nested calendar date changes
  const handleNestedCalendarDateSet = (dateInfo: any) => {
    // Pass through to parent onDateSet handler
    onDateSet(dateInfo);
  };

  // Enhanced team selection handler - CRITICAL: Always pass the exact day date
  const handleSelectStaff = (resourceId: string, resourceTitle: string, dayDate: Date) => {
    console.log('UnifiedResourceCalendar.handleSelectStaff called with:', resourceId, resourceTitle, 'for date:', format(dayDate, 'yyyy-MM-dd'));
    if (onSelectStaff) {
      // IMPORTANT: Always pass the specific day date, never fallback to currentDate
      onSelectStaff(resourceId, resourceTitle, dayDate);
    } else {
      console.error('UnifiedResourceCalendar: onSelectStaff prop is not defined');
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

  // Filter events for each specific day to prevent duplicates
  const getEventsForDay = (date: Date): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayEvents = events.filter(event => {
      const eventStart = new Date(event.start);
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr;
    });
    
    console.log(`UnifiedResourceCalendar: Events for ${dateStr}: ${dayEvents.length} events`);
    return dayEvents;
  };

  // Scroll to today for monthly view
  useEffect(() => {
    if (viewMode === 'monthly' && todayRef.current) {
      const timer = setTimeout(() => {
        todayRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentDate, viewMode]);

  // Get container class based on view mode
  const getContainerClass = () => {
    if (viewMode === 'weekly') {
      return 'weekly-view-container';
    } else {
      return 'monthly-grid-container';
    }
  };

  const getCalendarContainerClass = () => {
    if (viewMode === 'weekly') {
      return 'weekly-calendar-container';
    } else {
      return 'monthly-calendar-grid';
    }
  };

  return (
    <div className={getContainerClass()}>
      <div className={getCalendarContainerClass()} ref={containerRef}>
        {days.map((date, index) => {
          // Get only the events for this specific day
          const dayEvents = getEventsForDay(date);
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isCurrentMonth = viewMode === 'monthly' ? isSameMonth(date, currentDate) : true;
          
          // Convert forceRefresh to boolean for ResourceCalendar
          const resourceCalendarForceRefresh = numericForceRefresh > 0;
          
          console.log(`UnifiedResourceCalendar: Rendering calendar for ${format(date, 'yyyy-MM-dd')} with ${dayEvents.length} events`);
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className={viewMode === 'weekly' ? 'day-calendar-wrapper' : 'monthly-day-wrapper'}
              ref={isToday ? todayRef : null}
              style={viewMode === 'weekly' ? { width: `${getDayWidth()}px` } : {}}
            >
              {/* Clickable day header */}
              <div 
                className={`day-header ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
                onClick={() => handleDayHeaderClick(date)}
                title="Click to view resource schedule"
              >
                <div>{format(date, 'EEE d')}</div>
              </div>
              <div className={viewMode === 'weekly' ? 'weekly-view-calendar' : 'monthly-view-calendar'}>
                <ResourceCalendar
                  events={dayEvents}
                  resources={resources}
                  isLoading={isLoading}
                  isMounted={isMounted}
                  currentDate={date}
                  onDateSet={handleNestedCalendarDateSet}
                  refreshEvents={refreshEvents}
                  onStaffDrop={(staffId: string, resourceId: string | null) => handleStaffDrop(staffId, resourceId, date)}
                  onSelectStaff={(resourceId: string, resourceTitle: string) => handleSelectStaff(resourceId, resourceTitle, date)}
                  forceRefresh={resourceCalendarForceRefresh}
                  key={`calendar-${format(date, 'yyyy-MM-dd')}-${numericForceRefresh}`}
                  droppableScope={`${viewMode}-calendar`}
                  calendarProps={getCommonCalendarProps(index)}
                  targetDate={date}
                  staffOperations={staffOperations}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(UnifiedResourceCalendar);

