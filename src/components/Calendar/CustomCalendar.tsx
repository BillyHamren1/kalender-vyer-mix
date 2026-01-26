import React, { useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import TimeGrid from './TimeGrid';

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
  getVisibleTeamsForDay?: (date: Date) => string[];
  onToggleTeamForDay?: (teamId: string, date: Date) => void;
  allTeams?: Resource[];
  variant?: 'default' | 'warehouse';
  isEventReadOnly?: (event: CalendarEvent) => boolean;
  onEventClick?: (event: CalendarEvent) => void;
}

const CustomCalendar: React.FC<CustomCalendarProps> = ({
  events,
  resources,
  isLoading,
  currentDate,
  refreshEvents,
  onStaffDrop,
  onOpenStaffSelection,
  weeklyStaffOperations,
  getVisibleTeamsForDay,
  onToggleTeamForDay,
  allTeams,
  variant = 'default',
  isEventReadOnly,
  onEventClick
}) => {
  // IMPORTANT: Don't keep an internal week state.
  // The parent controls the current week via `currentDate`.
  const currentWeekStart = currentDate;
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

  // Optimized event resize handler - update and refresh
  const handleEventResize = async () => {
    console.log('CustomCalendar: Manual refresh after resize');
    await refreshEvents();
  };

  // Get filtered resources for a specific day
  const getFilteredResourcesForDay = (date: Date): Resource[] => {
    if (!getVisibleTeamsForDay) return resources;
    const visibleTeams = getVisibleTeamsForDay(date);
    return resources.filter(resource => visibleTeams.includes(resource.id));
  };

  // Calculate day width based on number of visible teams
  const getDayWidth = (numTeams: number) => {
    const timeColumnWidth = 80;
    const minTeamColumnWidth = 128; // Synkad med TimeGrid teamColumnWidth

    return timeColumnWidth + (numTeams * minTeamColumnWidth);
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
      {/* Modern Weekly Staff Planning Grid - Cards with gaps */}
      <div className="weekly-calendar-container overflow-x-auto p-4">
        <div className="weekly-calendar-grid flex gap-4">
          {days.map((date) => {
            const filteredResources = getFilteredResourcesForDay(date);
            const dayWidth = getDayWidth(filteredResources.length);
            const visibleTeams = getVisibleTeamsForDay ? getVisibleTeamsForDay(date) : [];

            return (
              <div 
                key={format(date, 'yyyy-MM-dd')} 
                className={`day-card flex-shrink-0 bg-background rounded-2xl shadow-lg border border-border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}
                style={{ width: `${dayWidth}px` }}
              >
                <TimeGrid
                  day={date}
                  resources={filteredResources}
                  events={events}
                  getEventsForDayAndResource={getEventsForDayAndResource}
                  onStaffDrop={onStaffDrop}
                  onOpenStaffSelection={onOpenStaffSelection}
                  dayWidth={dayWidth}
                  weeklyStaffOperations={weeklyStaffOperations}
                  onEventResize={handleEventResize}
                  teamVisibilityProps={allTeams && onToggleTeamForDay ? {
                    allTeams,
                    visibleTeams,
                    onToggleTeam: (teamId: string) => onToggleTeamForDay(teamId, date)
                  } : undefined}
                  variant={variant}
                  isEventReadOnly={isEventReadOnly}
                  onEventClick={onEventClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
