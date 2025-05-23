
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, startOfWeek, addWeeks, subWeeks, addDays, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import './DynamicColumnStyles.css';

interface TestMonthlyResourceCalendarProps {
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

const TestMonthlyResourceCalendar: React.FC<TestMonthlyResourceCalendarProps> = ({
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
  const [isScrolling, setIsScrolling] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastScrollPosition = useRef(0);
  const scrollTimeoutRef = useRef<number | null>(null);
  
  // Generate days for current month only with minimal padding to improve performance
  const allDays = useMemo(() => {
    const result: Date[] = [];
    
    // Get the current month start
    const currentMonthStart = startOfMonth(currentDate);
    const currentMonthEnd = endOfMonth(currentMonthStart);
    
    // Add 1 week before and after for context, but not 3 full months
    const startDate = subWeeks(startOfWeek(currentMonthStart, { weekStartsOn: 1 }), 1);
    const endDate = addWeeks(startOfWeek(currentMonthEnd, { weekStartsOn: 1 }), 1);
    
    // Add all days from start to end
    let currentDay = startDate;
    while (currentDay <= endDate) {
      result.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }
    
    return result;
  }, [currentDate]);

  // Calculate initial scroll position immediately when component mounts
  const initialScrollPosition = useMemo(() => {
    if (allDays.length === 0) return 0;
    
    const today = new Date();
    const todayFormatted = format(today, 'yyyy-MM-dd');
    
    const todayIndex = allDays.findIndex(date => 
      format(date, 'yyyy-MM-dd') === todayFormatted
    );
    
    if (todayIndex >= 0) {
      const dayWidth = 552; // 550px width + 2px gap
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      return Math.max(0, (todayIndex * dayWidth) - (viewportWidth / 2) + (dayWidth / 2));
    }
    
    return 0;
  }, [allDays]);

  // Handle scroll end detection
  const handleScrollEnd = useCallback(() => {
    setIsScrolling(false);
  }, []);

  // Apply initial scroll position immediately without animation
  useEffect(() => {
    if (!containerRef.current || isInitialized) return;
    
    // Set scroll position immediately
    containerRef.current.scrollLeft = initialScrollPosition;
    setIsInitialized(true);
  }, [initialScrollPosition, isInitialized]);

  // Simplified scroll handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    
    lastScrollPosition.current = scrollLeft;
    setIsScrolling(true);
    
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = window.setTimeout(handleScrollEnd, 150);
  }, [handleScrollEnd]);

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Handle staff drop
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId);
      } catch (error) {
        console.error('Error in handleStaffDrop:', error);
      }
    }
  };

  // Handle nested calendar date set
  const handleNestedCalendarDateSet = (dateInfo: any) => {
    if (dateInfo.view.calendar.el.getAttribute('data-day-index') === '0') {
      onDateSet(dateInfo);
    }
  };
  
  // Handle staff selection
  const handleSelectStaff = (resourceId: string, resourceTitle: string) => {
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    }
  };

  // Get calendar props - consistent for all columns
  const getCalendarProps = (dayIndex: number) => {
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: 80,
      slotMinWidth: 80,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: 80
        }
      ],
      'data-day-index': dayIndex.toString(),
    };
  };

  // Check if it's the first day of month for month separator
  const isFirstDayOfMonth = (date: Date, index: number) => {
    return date.getDate() === 1 && index > 0;
  };

  // Check if it's today to highlight it
  const isToday = (date: Date) => {
    const today = new Date();
    return format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
  };

  // Show loading state until initialized to prevent flickering
  if (!isInitialized) {
    return (
      <div className="dynamic-monthly-view-container">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dynamic-monthly-view-container">
      <div 
        className="dynamic-calendar-container" 
        ref={containerRef}
        style={{ scrollLeft: initialScrollPosition }}
      >
        {allDays.map((date, index) => {
          const showMonthSeparator = isFirstDayOfMonth(date, index);
          const isTodayDate = isToday(date);
          
          return (
            <React.Fragment key={format(date, 'yyyy-MM-dd')}>
              {showMonthSeparator && (
                <div className="month-separator">
                  <div className="month-separator-line"></div>
                  <div className="month-separator-label">
                    {format(date, 'MMMM yyyy')}
                  </div>
                  <div className="month-separator-line"></div>
                </div>
              )}
              <div className="dynamic-day-wrapper">
                <div className={`day-header-monthly ${isTodayDate ? 'today' : ''}`}>
                  <div className="day-name">{format(date, 'EEE')}</div>
                  <div className="day-number">{format(date, 'd')}</div>
                </div>
                <div className="dynamic-calendar">
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
                    droppableScope="test-monthly-calendar"
                    calendarProps={getCalendarProps(index)}
                  />
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(TestMonthlyResourceCalendar);
