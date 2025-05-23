
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
  const lastScrollPosition = useRef(0);
  const scrollTimeoutRef = useRef<number | null>(null);
  const initialScrollApplied = useRef(false);
  
  // Generate days for 3 months: previous, current, and next month
  // Each month includes -1 week and +1 week padding
  const allDays = useMemo(() => {
    const result: Date[] = [];
    
    // Get the current month start
    const currentMonthStart = startOfMonth(currentDate);
    
    // Generate for 3 months: previous, current, next
    for (let monthOffset = -1; monthOffset <= 1; monthOffset++) {
      const monthStart = startOfMonth(addMonths(currentMonthStart, monthOffset));
      const monthEnd = endOfMonth(monthStart);
      
      // Start from 1 week before the month (start of the week containing the first day of month)
      const startDate = subWeeks(startOfWeek(monthStart, { weekStartsOn: 1 }), 1);
      
      // End 1 week after the month (end of the week containing the last day of month)
      const endDate = addWeeks(startOfWeek(monthEnd, { weekStartsOn: 1 }), 1);
      
      // Add all days from start to end
      let currentDay = startDate;
      while (currentDay <= endDate) {
        result.push(new Date(currentDay));
        currentDay = addDays(currentDay, 1);
      }
    }
    
    return result;
  }, [currentDate]);

  // Handle scroll end detection
  const handleScrollEnd = useCallback(() => {
    setIsScrolling(false);
  }, []);

  // Calculate the initial scroll position without animation
  const calculateInitialScrollPosition = useCallback(() => {
    if (!containerRef.current || initialScrollApplied.current || allDays.length === 0) return;
    
    // Get today's date for comparison
    const today = new Date();
    const todayFormatted = format(today, 'yyyy-MM-dd');
    
    // Find the index of today in the allDays array
    const todayIndex = allDays.findIndex(date => 
      format(date, 'yyyy-MM-dd') === todayFormatted
    );
    
    // If today is found in our list of days, scroll to it
    if (todayIndex >= 0) {
      const dayWidth = 552; // 550px width + 2px gap
      const containerWidth = containerRef.current.clientWidth;
      const scrollPosition = (todayIndex * dayWidth) - (containerWidth / 2) + (dayWidth / 2);
      
      // Set scroll position immediately without animation
      containerRef.current.scrollLeft = Math.max(0, scrollPosition);
      initialScrollApplied.current = true;
    }
  }, [allDays]);

  // Simplified scroll handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    
    // Update last scroll position for direction detection
    lastScrollPosition.current = scrollLeft;
    
    // Set scrolling state
    setIsScrolling(true);
    
    // Clear any existing timeouts
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set a timeout to detect when scrolling stops
    scrollTimeoutRef.current = window.setTimeout(handleScrollEnd, 150);
  }, [handleScrollEnd]);

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Add scroll event listener
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      // Clean up the scroll listener
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Apply initial scroll position once the container is ready
  useEffect(() => {
    if (containerRef.current && !initialScrollApplied.current) {
      // Reset the flag when currentDate changes
      initialScrollApplied.current = false;
      
      // Use requestAnimationFrame to ensure the DOM is ready
      requestAnimationFrame(() => {
        calculateInitialScrollPosition();
      });
    }
  }, [calculateInitialScrollPosition, allDays]);

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

  return (
    <div className="dynamic-monthly-view-container">
      <div className="dynamic-calendar-container" ref={containerRef}>
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
                {/* Add day header above each calendar */}
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
