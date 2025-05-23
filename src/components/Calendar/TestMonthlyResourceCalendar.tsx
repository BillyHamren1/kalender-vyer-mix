
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
    
    // Column widths: normal = 550px, center = 750px
    let accumulatedWidth = 0;
    let centerIndex = 0;
    
    for (let i = 0; i < monthDays.length; i++) {
      const isCurrentCenter = i === centerColumnIndex;
      const columnWidth = isCurrentCenter ? 750 : 550;
      
      if (accumulatedWidth + columnWidth / 2 >= centerPosition) {
        centerIndex = i;
        break;
      }
      
      accumulatedWidth += columnWidth;
    }
    
    if (centerIndex !== centerColumnIndex) {
      setCenterColumnIndex(centerIndex);
    }
  }, [monthDays.length, centerColumnIndex]);

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      calculateCenterColumn();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [calculateCenterColumn]);

  // Initial setup to find today and center it
  useEffect(() => {
    if (containerRef.current) {
      const today = new Date();
      const todayIndex = monthDays.findIndex(date => 
        format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
      );
      
      if (todayIndex >= 0) {
        setCenterColumnIndex(todayIndex);
        
        // Calculate scroll position considering variable widths
        let scrollPosition = 0;
        for (let i = 0; i < todayIndex; i++) {
          scrollPosition += 550; // Normal column width
        }
        
        // Center the today column
        const containerWidth = containerRef.current.clientWidth;
        scrollPosition = scrollPosition - (containerWidth / 2) + (750 / 2); // 750 is center column width
        
        containerRef.current.scrollLeft = Math.max(0, scrollPosition);
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
