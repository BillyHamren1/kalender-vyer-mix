
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
  viewMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setLastViewedDate } = useContext(CalendarContext);

  // Calculate dynamic width based on view mode - OPTIMIZED for team columns
  const calculateDayWidth = () => {
    if (viewMode === 'weekly') {
      // Optimized width calculation for weekly view with team columns
      const teamCount = resources.length;
      const timeColumnWidth = 60; // Time column on the left
      const teamColumnWidth = 100; // Optimized smaller width per team
      const padding = 20;
      
      // Calculate total width needed for all teams plus time column
      const totalWidth = timeColumnWidth + (teamCount * teamColumnWidth) + padding;
      return Math.max(totalWidth, 400); // Minimum reasonable width
    }
    
    // For monthly/resource view, use larger width
    const teamCount = resources.length;
    const timeColumnWidth = 60;
    const teamColumnWidth = 120;
    const padding = 20;
    
    const minWidth = timeColumnWidth + (teamCount * teamColumnWidth) + padding;
    return Math.max(minWidth, 300);
  };

  const dynamicDayWidth = calculateDayWidth();

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

  console.log(`UnifiedResourceCalendar: ${viewMode} view with ${events.length} events, forceRefresh: ${numericForceRefresh}, dynamicDayWidth: ${dynamicDayWidth}px, teams: ${resources.length}`);

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

  // Common calendar props - RESTORED team functionality for weekly view
  const getCommonCalendarProps = (dayIndex: number) => {
    const teamCount = resources.length;
    
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay', // Always use resource view to preserve team columns
      resourceAreaWidth: viewMode === 'weekly' ? 100 : 120, // Optimized width for weekly
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: viewMode === 'weekly' ? 100 : 120
        }
      ],
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: viewMode === 'weekly' ? 100 : 120, // Optimized for weekly
      'data-day-index': dayIndex.toString(),
      'data-team-count': teamCount,
      contentHeight: 'auto',
      expandRows: true,
      aspectRatio: viewMode === 'weekly' ? 1.2 : 1.35,
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
      <div 
        className={getCalendarContainerClass()} 
        ref={containerRef}
        style={{
          // Set total width based on teams and optimized for weekly view
          minWidth: viewMode === 'weekly' ? `${days.length * dynamicDayWidth}px` : 'auto',
          width: viewMode === 'weekly' ? 'fit-content' : 'auto'
        }}
      >
        {days.map((date, index) => {
          // Get only the events for this specific day
          const dayEvents = getEventsForDay(date);
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isCurrentMonth = viewMode === 'monthly' ? isSameMonth(date, currentDate) : true;
          
          // Convert forceRefresh to boolean for ResourceCalendar
          const resourceCalendarForceRefresh = numericForceRefresh > 0;
          
          console.log(`UnifiedResourceCalendar: Rendering calendar for ${format(date, 'yyyy-MM-dd')} with ${dayEvents.length} events and ${resources.length} teams`);
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className={viewMode === 'weekly' ? 'day-calendar-wrapper' : 'monthly-day-wrapper'}
              ref={isToday ? todayRef : null}
              style={{
                // Set width to accommodate all teams with optimized sizing
                width: viewMode === 'weekly' ? `${dynamicDayWidth}px` : 'auto',
                minWidth: viewMode === 'weekly' ? `${dynamicDayWidth}px` : 'auto',
                maxWidth: viewMode === 'weekly' ? `${dynamicDayWidth}px` : 'auto',
                flex: viewMode === 'weekly' ? '0 0 auto' : undefined
              }}
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
