
import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const [monthsToShow, setMonthsToShow] = useState(3); // Show 3 months initially
  const [currentMonthOffset, setCurrentMonthOffset] = useState(-1); // Start with previous month
  
  // Generate days for multiple months
  const generateMonthDays = useCallback(() => {
    const allDays: Date[] = [];
    
    for (let i = 0; i < monthsToShow; i++) {
      const monthDate = addMonths(currentDate, currentMonthOffset + i);
      const monthStart = startOfMonth(monthDate);
      const daysInMonth = getDaysInMonth(monthDate);
      
      const monthDays = Array.from({ length: daysInMonth }, (_, dayIndex) => {
        const date = new Date(monthStart);
        date.setDate(dayIndex + 1);
        return date;
      });
      
      allDays.push(...monthDays);
    }
    
    return allDays;
  }, [currentDate, monthsToShow, currentMonthOffset]);

  const allDays = generateMonthDays();

  // Calculate which column is in the center of the viewport
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

  // Detect if we need to load more months
  const checkForMoreMonths = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    
    // Load previous month if scrolled near the beginning
    if (scrollLeft < 2000) {
      setCurrentMonthOffset(prev => prev - 1);
      setMonthsToShow(prev => prev + 1);
    }
    
    // Load next month if scrolled near the end
    if (scrollLeft + clientWidth > scrollWidth - 2000) {
      setMonthsToShow(prev => prev + 1);
    }
  }, []);

  // Set up scroll listener with throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timeoutId: number;
    
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        calculateCenterColumn();
        checkForMoreMonths();
      }, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [calculateCenterColumn, checkForMoreMonths]);

  // Initial setup to find today and center it
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
        
        // Use setTimeout to ensure the DOM is ready
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollLeft = Math.max(0, scrollPosition);
          }
        }, 100);
      }
    }
  }, [allDays]);

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
