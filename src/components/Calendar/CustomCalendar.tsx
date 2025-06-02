
import React, { useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import TimeGrid from './TimeGrid';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface CustomCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date) => void;
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
  onOpenStaffSelection,
  viewMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate days for the week using the currentDate prop
  const getDaysToRender = () => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentDate);
      date.setDate(currentDate.getDate() + i);
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

  // Calculate day width for weekly view - SIGNIFICANTLY INCREASED for 6 team columns
  const getDayWidth = () => {
    // Base calculation: 6 teams × 140px per team + 80px for time column + padding
    const timeColumnWidth = 80;
    const teamColumnWidth = 140; // Increased from previous smaller width
    const numberOfTeams = resources.length;
    const padding = 20;
    
    // Minimum width to accommodate all team columns properly
    const calculatedWidth = timeColumnWidth + (numberOfTeams * teamColumnWidth) + padding;
    const minimumWidth = 900; // Significantly increased minimum to ensure all teams fit
    
    return Math.max(minimumWidth, calculatedWidth);
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
      {/* Refresh Button - moved to top right */}
      <div className="flex items-center justify-end mb-6">
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

      {/* Weekly Staff Planning Grid - 7 Days Horizontally with Much Wider Layout */}
      <div className="weekly-calendar-container overflow-x-auto">
        <div 
          className="weekly-calendar-grid flex"
          style={{
            minWidth: `${7 * getDayWidth()}px` // Total width will be ~6300px for proper display
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
                onOpenStaffSelection={onOpenStaffSelection}
                dayWidth={getDayWidth()}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
