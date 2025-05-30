
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

  // Calculate dynamic width based on view mode - FIXED for weekly view
  const calculateDayWidth = () => {
    if (viewMode === 'weekly') {
      // Fixed width for weekly view - reasonable size per day
      return 180; // 180px per day is reasonable
    }
    
    // For monthly/resource view, calculate based on teams
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

  console.log(`UnifiedResourceCalendar: ${viewMode} view with ${events.length} events, forceRefresh: ${numericForceRefresh}, dynamicDayWidth: ${dynamicDayWidth}px`);

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

  // Common calendar props - simplified for weekly view
  const getCommonCalendarProps = (dayIndex: number) => {
    if (viewMode === 'weekly') {
      return {
        height: 'auto',
        headerToolbar: false,
        allDaySlot: false,
        initialView: 'timeGridDay',
        'data-day-index': dayIndex.toString(),
        contentHeight: 'auto',
        expandRows: true,
        aspectRatio: 1.35,
      };
    }

    // For monthly/resource view, use the original logic
    const teamCount = resources.length;
    
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: 120,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: 120
        }
      ],
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: 120,
      'data-day-index': dayIndex.toString(),
      'data-team-count': teamCount,
      contentHeight: 'auto',
      expandRows: true,
      aspectRatio: 1.2,
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
          // Set reasonable total width for weekly view: 7 days × 180px = 1260px
          minWidth: viewMode === 'weekly' ? '1260px' : 'auto',
          maxWidth: viewMode === 'weekly' ? '1400px' : 'auto',
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
          
          console.log(`UnifiedResourceCalendar: Rendering calendar for ${format(date, 'yyyy-MM-dd')} with ${dayEvents.length} events`);
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className={viewMode === 'weekly' ? 'day-calendar-wrapper' : 'monthly-day-wrapper'}
              ref={isToday ? todayRef : null}
              style={{
                // Fixed width for weekly view
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
