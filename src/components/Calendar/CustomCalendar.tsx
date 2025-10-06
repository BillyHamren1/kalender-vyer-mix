import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format, addDays } from 'date-fns';
import TimeGrid from './TimeGrid';
import WeekNavigation from './WeekNavigation';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';

interface CustomCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date, buttonElement?: HTMLElement) => void;
  viewMode: 'weekly' | 'monthly';
  weeklyStaffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{id: string, name: string, color?: string}>;
    forceRefresh: () => void;
  };
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
  viewMode,
  weeklyStaffOperations
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

  const handleRefresh = async () => {
    await refreshEvents();
    if (weeklyStaffOperations) {
      weeklyStaffOperations.forceRefresh();
    }
  };

  const getEventsForDayAndResource = (date: Date, resourceId: string): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    return events.filter(event => {
      if (!event.start) {
        console.warn('Event missing start time:', event.id);
        return false;
      }
      
      const eventStart = new Date(event.start);
      
      // Validate date before formatting
      if (isNaN(eventStart.getTime())) {
        console.error('Invalid event start date:', event.id, event.start);
        return false;
      }
      
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr && event.resourceId === resourceId;
    });
  };

  // Event drop handler removed - events are now moved via click-based marking system

  // Optimized event resize handler - update and refresh
  const handleEventResize = async () => {
    console.log('CustomCalendar: Manual refresh after resize');
    await refreshEvents();
  };

  // Calculate day width
  const getDayWidth = () => {
    const numberOfTeams = resources.length;
    const timeColumnWidth = 80;
    const minTeamColumnWidth = 120;
    const padding = 24;
    
    const calculatedWidth = timeColumnWidth + (numberOfTeams * minTeamColumnWidth) + padding;
    const minimumWidth = Math.max(800, calculatedWidth);
    
    return minimumWidth;
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

      {/* Optimized Weekly Staff Planning Grid with NO loading toasts */}
      <div className="weekly-calendar-container overflow-x-auto">
        <div 
          className="weekly-calendar-grid flex gap-2"
          style={{
            minWidth: `${7 * getDayWidth()}px`
          }}
        >
          {days.map((date) => (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className="day-calendar-wrapper flex-shrink-0 border border-gray-300 rounded-lg"
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
                weeklyStaffOperations={weeklyStaffOperations}
                onEventResize={handleEventResize}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
