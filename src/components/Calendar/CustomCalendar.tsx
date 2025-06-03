import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format, addDays } from 'date-fns';
import TimeGrid from './TimeGrid';
import WeekNavigation from './WeekNavigation';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useWeeklyStaffOperations } from '@/hooks/useWeeklyStaffOperations';
import { toast } from 'sonner';

interface CustomCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date) => void;
  viewMode: 'weekly' | 'monthly';
  weeklyStaffOperations?: ReturnType<typeof useWeeklyStaffOperations>;
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

  // Handle refresh
  const handleRefresh = async () => {
    await refreshEvents();
    if (weeklyStaffOperations) {
      weeklyStaffOperations.forceRefresh();
    }
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

  // Handle event drop between teams/resources
  const handleEventDrop = async (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => {
    console.log('CustomCalendar: Event drop detected', {
      eventId,
      targetResourceId,
      targetDate,
      targetTime
    });

    try {
      // Find the event being moved
      const eventToMove = events.find(event => event.id === eventId);
      if (!eventToMove) {
        toast.error('Event not found');
        return;
      }

      // For now, we'll show a success message and refresh
      // You can integrate with your existing event update service here
      const sourceTeam = resources.find(r => r.id === eventToMove.resourceId)?.title || 'Unknown';
      const targetTeam = resources.find(r => r.id === targetResourceId)?.title || 'Unknown';
      
      toast.success(`Event "${eventToMove.title}" moved from ${sourceTeam} to ${targetTeam}`);
      
      // Refresh the calendar to show changes
      await refreshEvents();
      
    } catch (error) {
      console.error('Error moving event:', error);
      toast.error('Failed to move event. Please try again.');
    }
  };

  // Calculate day width - SIGNIFICANTLY INCREASED to accommodate all teams
  const getDayWidth = () => {
    // Calculate based on number of teams (usually 6 teams)
    const numberOfTeams = resources.length;
    const timeColumnWidth = 80;
    const minTeamColumnWidth = 120; // Increased minimum width per team
    const padding = 24; // Extra padding for spacing
    
    const calculatedWidth = timeColumnWidth + (numberOfTeams * minTeamColumnWidth) + padding;
    
    // Ensure minimum width that can display all teams comfortably
    const minimumWidth = Math.max(800, calculatedWidth); // Increased from 250px to 800px minimum
    
    console.log('CustomCalendar: Day width calculation', {
      numberOfTeams,
      timeColumnWidth,
      minTeamColumnWidth,
      calculatedWidth,
      finalWidth: minimumWidth
    });
    
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

      {/* Weekly Staff Planning Grid - 7 Days Horizontally with WIDER containers */}
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
                onEventDrop={handleEventDrop}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
