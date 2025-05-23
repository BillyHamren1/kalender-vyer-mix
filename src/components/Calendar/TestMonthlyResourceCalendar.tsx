
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
  const [centerColumnIndex, setCenterColumnIndex] = useState<number>(0);
  const [monthsToShow, setMonthsToShow] = useState(6); // Start with 6 months initially for better preloading
  const [currentMonthOffset, setCurrentMonthOffset] = useState(-3); // Start with previous 3 months
  const [isScrolling, setIsScrolling] = useState(false);
  const lastScrollPosition = useRef(0);
  const scrollDirectionRef = useRef<'left' | 'right' | null>(null);
  const requestIdRef = useRef<number | null>(null);
  
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

  // Calculate which column is in the center of the viewport - with improved performance
  const calculateCenterColumn = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const centerPosition = scrollLeft + containerWidth / 2;
    
    // Calculate accumulated width considering dynamic column sizes
    let accumulatedWidth = 0;
    let newCenterIndex = 0;
    
    for (let i = 0; i < allDays.length; i++) {
      const isCurrentCenter = i === centerColumnIndex;
      const columnWidth = isCurrentCenter ? 750 : 550;
      const gap = 2;
      
      if (centerPosition >= accumulatedWidth && centerPosition < accumulatedWidth + columnWidth) {
        newCenterIndex = i;
        break;
      }
      
      accumulatedWidth += columnWidth + gap;
    }
    
    if (newCenterIndex !== centerColumnIndex) {
      setCenterColumnIndex(newCenterIndex);
    }
  }, [allDays.length, centerColumnIndex]);

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
      // Add multiple months at once (3) for better buffering
      setCurrentMonthOffset(prev => {
        console.log(`Updating month offset from ${prev} to ${prev - 3}`);
        return prev - 3;
      });
      setMonthsToShow(prev => prev + 3);
      
      // Save current position to restore after DOM update
      const currentPos = scrollLeft;
      
      // After DOM update, maintain relative scroll position
      // This setTimeout is necessary to wait for the DOM to update
      requestAnimationFrame(() => {
        if (containerRef.current) {
          // Calculate new position to maintain the same view
          const additionalWidth = 3 * 30 * 550; // Approximate width of 3 months
          containerRef.current.scrollLeft = currentPos + additionalWidth;
        }
      });
    }
    
    // Load next months if scrolled near the end
    if (scrollLeft + clientWidth > scrollWidth - threshold && direction === 'right') {
      console.log('Near end of content - Loading next months');
      // Add multiple months at once for better buffering
      setMonthsToShow(prev => prev + 3);
    }
    
    // Update center column calculation
    calculateCenterColumn();
    
    // Mark as not scrolling after a delay to prevent too many updates
    if (requestIdRef.current) {
      cancelAnimationFrame(requestIdRef.current);
    }
    
    requestIdRef.current = requestAnimationFrame(() => {
      setIsScrolling(false);
      requestIdRef.current = null;
    });
  }, [calculateCenterColumn]);

  // Set up improved scroll listener with requestAnimationFrame
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const scrollListener = () => {
      setIsScrolling(true);
      
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
        setCenterColumnIndex(todayIndex);
        
        // Calculate scroll position
        let scrollPosition = 0;
        for (let i = 0; i < todayIndex; i++) {
          scrollPosition += 550 + 2;
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
  }, [allDays]); // Only run when allDays changes, which should be once initially

  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    if (onStaffDrop) {
      try {
        await onStaffDrop(staffId, resourceId);
      } catch (error) {
        console.error('Error in handleStaffDrop:', error);
      }
    }
  };

  const handleNestedCalendarDateSet = (dateInfo: any) => {
    if (dateInfo.view.calendar.el.getAttribute('data-day-index') === '0') {
      onDateSet(dateInfo);
    }
  };
  
  const handleSelectStaff = (resourceId: string, resourceTitle: string) => {
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    }
  };

  const getCalendarProps = (dayIndex: number) => {
    const isCenterColumn = dayIndex === centerColumnIndex;
    
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: isCenterColumn ? 120 : 80,
      slotMinWidth: isCenterColumn ? 120 : 80,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: isCenterColumn ? 120 : 80
        }
      ],
      'data-day-index': dayIndex.toString(),
    };
  };

  // Group days by month for rendering month separators
  const getMonthGroup = (date: Date) => {
    return format(date, 'yyyy-MM');
  };

  // Debugging output for scroll state
  useEffect(() => {
    console.log(`Current months showing: ${monthsToShow}, offset: ${currentMonthOffset}, center: ${centerColumnIndex}, days: ${allDays.length}`);
  }, [monthsToShow, currentMonthOffset, centerColumnIndex, allDays.length]);
  
  // Add scroll debugging helper
  useEffect(() => {
    const logScrollMetrics = () => {
      if (containerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
        console.log(`Scroll metrics - left: ${scrollLeft}, width: ${scrollWidth}, client: ${clientWidth}, percentage: ${((scrollLeft / (scrollWidth - clientWidth)) * 100).toFixed(1)}%`);
      }
    };
    
    // Log initial metrics
    requestAnimationFrame(logScrollMetrics);
    
    // Also add a key press handler for debugging
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' && e.ctrlKey) {
        logScrollMetrics();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="dynamic-monthly-view-container">
      <div className="dynamic-calendar-container" ref={containerRef}>
        {allDays.map((date, index) => {
          const isCenterColumn = index === centerColumnIndex;
          const isFirstDayOfMonth = date.getDate() === 1;
          const monthGroup = getMonthGroup(date);
          
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
              <div 
                className={`dynamic-day-wrapper ${isCenterColumn ? 'center-column' : 'normal-column'}`}
              >
                <div className={`day-header ${isCenterColumn ? 'center-header' : ''}`}>
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
