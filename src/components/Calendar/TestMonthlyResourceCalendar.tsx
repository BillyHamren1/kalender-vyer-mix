import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, startOfWeek, addWeeks, subWeeks, addDays, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import './DynamicColumnStyles.css';
import { useNavigate } from 'react-router-dom';

interface TestMonthlyResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
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
  const scrollTimeoutRef = useRef<number | null>(null);
  const navigate = useNavigate();
  
  // Generate days for current month with exactly ±1 week padding
  const allDays = useMemo(() => {
    const result: Date[] = [];
    
    // Get the current month boundaries
    const currentMonthStart = startOfMonth(currentDate);
    const currentMonthEnd = endOfMonth(currentMonthStart);
    
    // Get the Monday of the week containing the first day of the month
    const firstWeekStart = startOfWeek(currentMonthStart, { weekStartsOn: 1 });
    
    // Get the Sunday of the week containing the last day of the month
    const lastWeekEnd = addDays(startOfWeek(currentMonthEnd, { weekStartsOn: 1 }), 6);
    
    // Add exactly 1 week before and 1 week after for padding
    const startDate = subWeeks(firstWeekStart, 1);
    const endDate = addWeeks(lastWeekEnd, 1);
    
    // Generate all days from start to end
    let currentDay = startDate;
    while (currentDay <= endDate) {
      result.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }
    
    console.log(`Generated ${result.length} days for month view: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
    
    return result;
  }, [currentDate]);

  // Handle day header click to navigate to resource view
  const handleDayHeaderClick = useCallback((date: Date) => {
    console.log('Day header clicked:', format(date, 'yyyy-MM-dd'));
    
    // Store the selected date in sessionStorage
    sessionStorage.setItem('calendarDate', date.toISOString());
    
    // Navigate to the existing resource view page
    navigate('/resource-view');
  }, [navigate]);

  // Center calendar on today's date after render is complete
  useEffect(() => {
    // Use a slightly longer timeout to ensure the DOM is fully rendered
    const timer = setTimeout(() => {
      if (!containerRef.current || allDays.length === 0) return;
      
      const today = new Date();
      const todayFormatted = format(today, 'yyyy-MM-dd');
      
      const todayIndex = allDays.findIndex(date => 
        format(date, 'yyyy-MM-dd') === todayFormatted
      );
      
      if (todayIndex >= 0) {
        const dayWidth = 662; // 660px width + 2px gap
        const viewportWidth = window.innerWidth;
        const scrollPos = Math.max(0, (todayIndex * dayWidth) - (viewportWidth / 2) + (dayWidth / 2));
        
        if (containerRef.current) {
          containerRef.current.scrollLeft = scrollPos;
          console.log(`Applied scroll position ${scrollPos} for today at index ${todayIndex}`);
        }
      } else {
        console.log('Today not found in the displayed days');
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [allDays]);

  // Handle scroll end detection
  const handleScrollEnd = useCallback(() => {
    setIsScrolling(false);
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    
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

  // Always render the calendar - no initial loading state
  return (
    <div className="dynamic-monthly-view-container">
      <div 
        className="dynamic-calendar-container" 
        ref={containerRef}
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
                <div 
                  className={`day-header-monthly ${isTodayDate ? 'today' : ''}`}
                  onClick={() => handleDayHeaderClick(date)}
                  style={{ cursor: 'pointer' }}
                >
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
