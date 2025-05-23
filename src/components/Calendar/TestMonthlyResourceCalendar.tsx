
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, getDaysInMonth, startOfMonth, addMonths, subMonths } from 'date-fns';
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
  const [monthsToShow, setMonthsToShow] = useState(6);
  const [currentMonthOffset, setCurrentMonthOffset] = useState(-3);
  const [isScrolling, setIsScrolling] = useState(false);
  const lastScrollPosition = useRef(0);
  const scrollDirectionRef = useRef<'left' | 'right' | null>(null);
  const requestIdRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  
  // Generate days for multiple months - memoize this heavy calculation
  const allDays = useMemo(() => {
    console.log(`Generating days for ${monthsToShow} months with offset ${currentMonthOffset}`);
    const result: Date[] = [];
    
    for (let i = 0; i < monthsToShow; i++) {
      const monthDate = addMonths(currentDate, currentMonthOffset + i);
      const monthStart = startOfMonth(monthDate);
      const daysInMonth = getDaysInMonth(monthDate);
      
      const monthDays = Array.from({ length: daysInMonth }, (_, dayIndex) => {
        const date = new Date(monthStart);
        date.setDate(dayIndex + 1);
        return date;
      });
      
      result.push(...monthDays);
    }
    
    return result;
  }, [currentDate, monthsToShow, currentMonthOffset]);

  // Handle scroll end detection
  const handleScrollEnd = useCallback(() => {
    setIsScrolling(false);
  }, []);

  // Improved scroll handler with requestAnimationFrame for better performance
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    
    // Determine scroll direction
    const direction = scrollLeft > lastScrollPosition.current ? 'right' : 'left';
    scrollDirectionRef.current = direction;
    lastScrollPosition.current = scrollLeft;
    
    // Use a smaller threshold (500px) for faster detection
    const threshold = 500;
    
    // Calculate scroll percentage for debugging
    const scrollPercentage = (scrollLeft / (scrollWidth - clientWidth)) * 100;
    
    // Debug scroll metrics
    if (scrollPercentage > 92 || scrollPercentage < 8) {
      console.log(`Scroll position: ${scrollPercentage.toFixed(1)}%, direction: ${direction}`);
    }
    
    // Load previous months if scrolled near the beginning
    if (scrollLeft < threshold && direction === 'left') {
      console.log('Near start of content - Loading previous months');
      setCurrentMonthOffset(prev => {
        console.log(`Updating month offset from ${prev} to ${prev - 3}`);
        return prev - 3;
      });
      setMonthsToShow(prev => prev + 3);
      
      // Save current position to restore after DOM update
      const currentPos = scrollLeft;
      
      // After DOM update, maintain relative scroll position
      requestAnimationFrame(() => {
        if (containerRef.current) {
          // Calculate new position to maintain the same view with consistent column width
          const additionalWidth = 3 * 30 * 550; // Approximate width of 3 months
          containerRef.current.scrollLeft = currentPos + additionalWidth;
        }
      });
    }
    
    // Load next months if scrolled near the end
    if (scrollLeft + clientWidth > scrollWidth - threshold && direction === 'right') {
      console.log('Near end of content - Loading next months');
      setMonthsToShow(prev => prev + 3);
    }
    
    // Set scrolling state
    setIsScrolling(true);
    
    // Clear any existing timeouts
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set a new timeout to detect when scrolling stops
    scrollTimeoutRef.current = window.setTimeout(handleScrollEnd, 150);
  }, [handleScrollEnd]);

  // Set up improved scroll listener with requestAnimationFrame
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const scrollListener = () => {
      if (requestIdRef.current) {
        cancelAnimationFrame(requestIdRef.current);
      }
      
      requestIdRef.current = requestAnimationFrame(handleScroll);
    };

    container.addEventListener('scroll', scrollListener, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', scrollListener);
      if (requestIdRef.current) {
        cancelAnimationFrame(requestIdRef.current);
      }
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Initial setup to find today and center it - only run once
  useEffect(() => {
    if (containerRef.current && allDays.length > 0) {
      const today = new Date();
      const todayIndex = allDays.findIndex(date => 
        format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
      );
      
      if (todayIndex >= 0) {
        // Calculate scroll position with consistent column width
        let scrollPosition = 0;
        for (let i = 0; i < todayIndex; i++) {
          scrollPosition += 550 + 2; // Consistent width for all columns
        }
        
        const containerWidth = containerRef.current.clientWidth;
        scrollPosition = scrollPosition - (containerWidth / 2) + (550 / 2);
        
        // Use requestAnimationFrame to ensure the DOM is ready
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollLeft = Math.max(0, scrollPosition);
          }
        });
      }
    }
  }, [allDays]);

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

  // Get calendar props - now consistent for all columns
  const getCalendarProps = (dayIndex: number) => {
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: 80, // Consistent for all columns
      slotMinWidth: 80, // Consistent for all columns
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: 80 // Consistent for all columns
        }
      ],
      'data-day-index': dayIndex.toString(),
    };
  };

  // Debugging output for scroll state
  useEffect(() => {
    console.log(`Current months showing: ${monthsToShow}, offset: ${currentMonthOffset}, days: ${allDays.length}`);
  }, [monthsToShow, currentMonthOffset, allDays.length]);

  return (
    <div className="dynamic-monthly-view-container">
      <div className="dynamic-calendar-container" ref={containerRef}>
        {allDays.map((date, index) => {
          const isFirstDayOfMonth = date.getDate() === 1;
          
          return (
            <React.Fragment key={format(date, 'yyyy-MM-dd')}>
              {isFirstDayOfMonth && index > 0 && (
                <div className="month-separator">
                  <div className="month-separator-line"></div>
                  <div className="month-separator-label">
                    {format(date, 'MMMM yyyy')}
                  </div>
                  <div className="month-separator-line"></div>
                </div>
              )}
              <div className="dynamic-day-wrapper">
                <div className="day-header">
                  {format(date, 'EEE d')}
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
