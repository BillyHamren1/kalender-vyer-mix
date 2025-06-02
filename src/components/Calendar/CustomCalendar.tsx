
import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format, addDays } from 'date-fns';
import TimeGrid from './TimeGrid';
import WeekNavigation from './WeekNavigation';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface CustomCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  viewMode: 'weekly' | 'monthly';
}

const CustomCalendar: React.FC<CustomCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  refreshEvents,
  onStaffDrop,
  viewMode
}) => {
  const [currentWeekStart, setCurrentWeekStart] = useState(currentDate);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate days for the week
  const getDaysToRender = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      return date;
    });
  };

  const days = getDaysToRender();

  // Handle refresh
  const handleRefresh = async () => {
    await refreshEvents();
  };

  // Filter events for a specific day and resource
  const getEventsForDayAndResource = (date: Date, resourceId: string): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    return events.filter(event => {
      const eventStart = new Date(event.start);
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr && event.resourceId === resourceId;
    });
  };

  // Calculate day width for weekly view
  const getDayWidth = () => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dayWidth = Math.floor(containerWidth / 7);
      return Math.max(300, dayWidth); // Minimum width of 300px per day
    }
    return 300;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading staff planning calendar...</div>
      </div>
    );
  }

  return (
    <div className="custom-calendar-container" ref={containerRef}>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <WeekNavigation 
          currentWeekStart={currentWeekStart}
          setCurrentWeekStart={setCurrentWeekStart}
        />
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Weekly Staff Planning Grid - Horizontally Scrollable */}
      <div className="weekly-calendar-container overflow-x-auto">
        <div 
          className="weekly-calendar-grid flex"
          style={{
            minWidth: `${7 * getDayWidth()}px`
          }}
        >
          {days.map((date) => (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className="day-calendar-wrapper flex-shrink-0"
              style={{ width: `${getDayWidth()}px` }}
            >
              <TimeGrid
                day={date}
                resources={resources}
                events={events}
                getEventsForDayAndResource={getEventsForDayAndResource}
                onStaffDrop={onStaffDrop}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
