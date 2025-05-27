import React, { useEffect, useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { CalendarContext } from '@/App';
import { useDynamicColumnSizing } from '@/hooks/useDynamicColumnSizing';
import { DynamicResourceStyles } from './DynamicResourceStyles';
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

  // Use dynamic column sizing
  const dynamicSizing = useDynamicColumnSizing(resources, undefined, 120, 300);

  const getDaysToRender = () => {
    if (viewMode === 'weekly') {
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() + i);
        return date;
      });
    } else {
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
  const numericForceRefresh = typeof forceRefresh === 'boolean' ? (forceRefresh ? 1 : 0) : (forceRefresh || 0);

  console.log(`UnifiedResourceCalendar: ${viewMode} view with ${events.length} events, forceRefresh: ${numericForceRefresh}`);
  console.log('Dynamic sizing config:', dynamicSizing);

  const handleDayHeaderClick = (date: Date) => {
    setLastViewedDate(date);
    sessionStorage.setItem('calendarDate', date.toISOString());
    navigate('/resource-view');
  };

  const handleStaffDrop = async (staffId: string, resourceId: string | null, dayDate: Date) => {
    console.log(`UnifiedResourceCalendar.handleStaffDrop: staffId=${staffId}, resourceId=${resourceId || 'null'}, date=${format(dayDate, 'yyyy-MM-dd')}`);
    
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId, dayDate);
        console.log('UnifiedResourceCalendar: Staff drop operation successful for date:', format(dayDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('UnifiedResourceCalendar: Error in handleStaffDrop:', error);
      }
    }
  };

  const handleNestedCalendarDateSet = (dateInfo: any) => {
    onDateSet(dateInfo);
  };

  const handleSelectStaff = (resourceId: string, resourceTitle: string, dayDate: Date) => {
    console.log('UnifiedResourceCalendar.handleSelectStaff called with:', resourceId, resourceTitle, 'for date:', format(dayDate, 'yyyy-MM-dd'));
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle, dayDate);
    } else {
      console.error('UnifiedResourceCalendar: onSelectStaff prop is not defined');
    }
  };

  const getResourceTimeGridOptions = () => {
    return {
      resourceAreaWidth: dynamicSizing.columnWidth,
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: dynamicSizing.columnWidth
    };
  };

  const getCommonCalendarProps = (dayIndex: number) => {
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: dynamicSizing.columnWidth,
      slotMinWidth: dynamicSizing.columnWidth,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: dynamicSizing.columnWidth
        }
      ],
      ...getResourceTimeGridOptions(),
      'data-day-index': dayIndex.toString(),
    };
  };

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

  const getContainerClass = () => {
    if (viewMode === 'weekly') {
      return 'weekly-view-container';
    } else {
      return 'monthly-grid-container';
    }
  };

  const getCalendarContainerClass = () => {
    if (viewMode === 'weekly') {
      return 'weekly-calendar-container dynamic-calendar-container';
    } else {
      return 'monthly-calendar-grid';
    }
  };

  // Apply CSS variables to the document root
  useEffect(() => {
    const rootElement = document.documentElement;
    Object.entries(dynamicSizing.cssVariables).forEach(([key, value]) => {
      rootElement.style.setProperty(key, value);
    });

    return () => {
      // Cleanup on unmount
      Object.keys(dynamicSizing.cssVariables).forEach(key => {
        rootElement.style.removeProperty(key);
      });
    };
  }, [dynamicSizing.cssVariables]);

  return (
    <div className={getContainerClass()}>
      {/* Apply dynamic styles */}
      <DynamicResourceStyles cssVariables={dynamicSizing.cssVariables} />
      
      <div className={getCalendarContainerClass()} ref={containerRef}>
        {days.map((date, index) => {
          const dayEvents = getEventsForDay(date);
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isCurrentMonth = viewMode === 'monthly' ? isSameMonth(date, currentDate) : true;
          const resourceCalendarForceRefresh = numericForceRefresh > 0;
          
          console.log(`UnifiedResourceCalendar: Rendering calendar for ${format(date, 'yyyy-MM-dd')} with ${dayEvents.length} events`);
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className={`${viewMode === 'weekly' ? 'day-calendar-wrapper' : 'monthly-day-wrapper'} dynamic-day-wrapper`}
              ref={isToday ? todayRef : null}
            >
              <div 
                className={`day-header ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
                onClick={() => handleDayHeaderClick(date)}
                title="Click to view resource schedule"
              >
                <div>{format(date, 'EEE d')}</div>
              </div>
              <div className={`${viewMode === 'weekly' ? 'weekly-view-calendar' : 'monthly-view-calendar'} dynamic-resource-columns`}>
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
