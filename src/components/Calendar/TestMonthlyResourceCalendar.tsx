
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
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const centerPosition = scrollLeft + containerWidth / 2;
    
    // Use consistent column width for calculations (200px + 4px gap)
    const COLUMN_WIDTH = 200;
    const GAP = 4;
    const TOTAL_COLUMN_WIDTH = COLUMN_WIDTH + GAP;
    
    // Calculate which column the center position falls into
    const newCenterIndex = Math.floor(centerPosition / TOTAL_COLUMN_WIDTH);
    const clampedIndex = Math.max(0, Math.min(newCenterIndex, monthDays.length - 1));
    
    // Only update if it actually changed
    if (clampedIndex !== centerColumnIndex) {
      console.log(`Center column changed from ${centerColumnIndex} to ${clampedIndex}`);
      console.log(`Scroll position: ${scrollLeft}, Center position: ${centerPosition}, Calculated index: ${newCenterIndex}, Clamped: ${clampedIndex}`);
      setCenterColumnIndex(clampedIndex);
    }
  }, [monthDays.length, centerColumnIndex]);

  // Set up scroll listener with throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: number;
    let rafId: number;
    
    const handleScroll = () => {
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
      }, 100);
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
        const COLUMN_WIDTH = 200;
        const GAP = 4;
        const TOTAL_COLUMN_WIDTH = COLUMN_WIDTH + GAP;
        
        // Center the today column in the viewport
        const containerWidth = containerRef.current.clientWidth;
        const scrollPosition = (todayIndex * TOTAL_COLUMN_WIDTH) - (containerWidth / 2) + (COLUMN_WIDTH / 2);
        
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
      resourceAreaWidth: isCenterColumn ? '70px' : '60px',
      slotMinWidth: isCenterColumn ? '70px' : '60px',
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: isCenterColumn ? '70px' : '60px'
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
