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
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  forceRefresh?: boolean;
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

  // Handle day header click to navigate to daily view
  const handleDayHeaderClick = (date: Date) => {
    // Store the selected date in context and session storage
    setLastViewedDate(date);
    sessionStorage.setItem('dayCalendarDate', date.toISOString());
    
    // Navigate to the day view
    navigate('/day-view');
  };

  // Log staff drop operations for debugging
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    console.log(`UnifiedResourceCalendar.handleStaffDrop: staffId=${staffId}, resourceId=${resourceId || 'null'}`);
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId);
        console.log('Staff drop operation successful');
      } catch (error) {
        console.error('Error in handleStaffDrop:', error);
      }
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

  const getEventsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    return events.filter(event => {
      const eventStart = new Date(event.start);
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr;
    });
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
          const dayEvents = getEventsForDay(date);
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isCurrentMonth = viewMode === 'monthly' ? isSameMonth(date, currentDate) : true;
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className={viewMode === 'weekly' ? 'day-calendar-wrapper' : 'monthly-day-wrapper'}
              ref={isToday ? todayRef : null}
            >
              {/* Clickable day header */}
              <div 
                className={`day-header ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
                onClick={() => handleDayHeaderClick(date)}
                title="Click to view daily schedule"
              >
                {format(date, 'EEE d')}
              </div>
              <div className={viewMode === 'weekly' ? 'weekly-view-calendar' : 'monthly-view-calendar'}>
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
                  droppableScope={`${viewMode}-calendar`}
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

export default React.memo(UnifiedResourceCalendar);
