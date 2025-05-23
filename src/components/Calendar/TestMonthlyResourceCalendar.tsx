
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, getDaysInMonth, startOfMonth } from 'date-fns';
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
  const [isScrolling, setIsScrolling] = useState(false);
  
  const monthStart = startOfMonth(currentDate);
  const daysInMonth = getDaysInMonth(currentDate);
  
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(i + 1);
    return date;
  });

  // Calculate which column is in the center of the viewport
  const calculateCenterColumn = useCallback(() => {
    if (!containerRef.current || isScrolling) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const centerPosition = scrollLeft + containerWidth / 2;
    
    // Use consistent column width for calculations (no circular dependency)
    const COLUMN_WIDTH = 550;
    const GAP = 2;
    let accumulatedWidth = 0;
    let newCenterIndex = 0;
    
    for (let i = 0; i < monthDays.length; i++) {
      // Check if the center position falls within this column
      if (centerPosition >= accumulatedWidth && centerPosition < accumulatedWidth + COLUMN_WIDTH) {
        newCenterIndex = i;
        break;
      }
      
      accumulatedWidth += COLUMN_WIDTH + GAP;
    }
    
    // Only update if it actually changed
    if (newCenterIndex !== centerColumnIndex) {
      console.log(`Center column changed from ${centerColumnIndex} to ${newCenterIndex}`);
      console.log(`Scroll position: ${scrollLeft}, Center position: ${centerPosition}`);
      setCenterColumnIndex(newCenterIndex);
    }
  }, [monthDays.length, centerColumnIndex, isScrolling]);

  // Set up scroll listener with better throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: number;
    let rafId: number;
    
    const handleScroll = () => {
      setIsScrolling(true);
      
      // Clear existing timeouts
      clearTimeout(scrollTimeout);
      cancelAnimationFrame(rafId);
      
      // Use requestAnimationFrame for smooth updates
      rafId = requestAnimationFrame(() => {
        calculateCenterColumn();
      });
      
      // Mark scrolling as finished after a delay
      scrollTimeout = window.setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
      cancelAnimationFrame(rafId);
    };
  }, [calculateCenterColumn]);

  // Initial setup to find today and center it
  useEffect(() => {
    if (containerRef.current && monthDays.length > 0) {
      const today = new Date();
      const todayIndex = monthDays.findIndex(date => 
        format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
      );
      
      if (todayIndex >= 0) {
        setCenterColumnIndex(todayIndex);
        
        // Calculate scroll position using consistent column width
        const COLUMN_WIDTH = 550;
        const GAP = 2;
        let scrollPosition = 0;
        
        for (let i = 0; i < todayIndex; i++) {
          scrollPosition += COLUMN_WIDTH + GAP;
        }
        
        // Center the today column in the viewport
        const containerWidth = containerRef.current.clientWidth;
        scrollPosition = scrollPosition - (containerWidth / 2) + (COLUMN_WIDTH / 2);
        
        containerRef.current.scrollLeft = Math.max(0, scrollPosition);
        
        console.log(`Initial setup: Set center to today (index ${todayIndex}), scroll position: ${scrollPosition}`);
      } else {
        // If today is not in this month, center on the middle of the month
        const middleIndex = Math.floor(monthDays.length / 2);
        setCenterColumnIndex(middleIndex);
      }
    }
  }, [monthDays]);

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
      resourceAreaWidth: isCenterColumn ? '120px' : '80px',
      slotMinWidth: isCenterColumn ? '120px' : '80px',
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: isCenterColumn ? '120px' : '80px'
        }
      ],
      'data-day-index': dayIndex.toString(),
    };
  };

  return (
    <div className="dynamic-monthly-view-container">
      <div className="dynamic-calendar-container" ref={containerRef}>
        {monthDays.map((date, index) => {
          const isCenterColumn = index === centerColumnIndex;
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
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
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(TestMonthlyResourceCalendar);
