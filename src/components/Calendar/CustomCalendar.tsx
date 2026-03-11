import React, { useRef, useMemo, useCallback } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import TimeGrid from './TimeGrid';
import { useWeekDays } from '@/hooks/useWeekDays';
import { useCarouselState } from '@/hooks/useCarouselState';
import { useAvailableStaffWeek } from '@/hooks/useAvailableStaffWeek';
import { useStableEvents } from '@/hooks/useMemoizedEvents';
import { EditControllerProvider } from '@/contexts/EditControllerContext';
import './Carousel3DStyles.css';

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
  viewMode: 'weekly' | 'monthly' | 'day';
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
  viewMode,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const weekStartTime = currentDate.getTime();
  const days = useWeekDays(currentDate);

  // STABILIZATION: Deduplicate and stabilize event array reference
  const stableEvents = useStableEvents(events);

  const { getAvailableStaffForDay } = useAvailableStaffWeek(
    days, weekStartTime, resources, weeklyStaffOperations
  );

  const {
    centerIndex, setCenterIndex,
    getPositionFromCenter, navigateCarousel, handleDayCardClick
  } = useCarouselState(days, weekStartTime, containerRef, viewMode === 'day');

  // MEMOIZED: Pre-index events by "date|resourceId" key once per event change
  const eventIndex = useMemo(() => {
    const index = new Map<string, CalendarEvent[]>();
    for (const event of stableEvents) {
      if (!event.start) continue;
      const eventStart = new Date(event.start);
      if (isNaN(eventStart.getTime())) continue;
      const dateStr = format(eventStart, 'yyyy-MM-dd');
      const key = `${dateStr}|${event.resourceId}`;
      const arr = index.get(key);
      if (arr) {
        arr.push(event);
      } else {
        index.set(key, [event]);
      }
    }
    return index;
  }, [stableEvents]);

  const getEventsForDayAndResource = useCallback((date: Date, resourceId: string): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return eventIndex.get(`${dateStr}|${resourceId}`) || [];
  }, [eventIndex]);

  const handleEventResize = async () => {
    await refreshEvents();
  };

  const getFilteredResourcesForDay = (date: Date): Resource[] => {
    if (!getVisibleTeamsForDay) return resources;
    return resources.filter(r => getVisibleTeamsForDay(date).includes(r.id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading staff planning calendar...</div>
      </div>
    );
  }

  const isWeeklyMode = viewMode === 'weekly' || viewMode === 'monthly';

  const buildTimeGridProps = (date: Date, fullWidth: boolean, isCenter?: boolean) => {
    const filteredResources = getFilteredResourcesForDay(date);
    const visibleTeams = getVisibleTeamsForDay ? getVisibleTeamsForDay(date) : [];
    return {
      day: date,
      resources: filteredResources,
      events: stableEvents,
      getEventsForDayAndResource,
      onStaffDrop,
      onOpenStaffSelection,
      dayWidth: undefined,
      weeklyStaffOperations,
      onEventResize: handleEventResize,
      teamVisibilityProps: allTeams && onToggleTeamForDay ? {
        allTeams,
        visibleTeams,
        onToggleTeam: (teamId: string) => onToggleTeamForDay!(teamId, date)
      } : undefined,
      variant,
      isEventReadOnly,
      onEventClick,
      fullWidth,
      availableStaff: getAvailableStaffForDay(date),
      ...(isCenter ? {
        carouselNav: {
          onNavigateLeft: () => navigateCarousel('left'),
          onNavigateRight: () => navigateCarousel('right')
        }
      } : {})
    };
  };

  // Weekly/Monthly mode
  if (isWeeklyMode) {
    return (
      <EditControllerProvider>
        <div className="custom-calendar-container weekly-view" ref={containerRef}>
          <div className={`weekly-horizontal-grid ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
            {days.map((date) => {
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              return (
                <div key={format(date, 'yyyy-MM-dd')} className={`weekly-day-card ${isToday ? 'is-today' : ''}`}>
                  <div className={`day-card bg-background rounded-2xl shadow-lg border border-border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
                    <TimeGrid {...buildTimeGridProps(date, false)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </EditControllerProvider>
    );
  }

  // Day mode: 3D Carousel
  return (
    <div className="custom-calendar-container" ref={containerRef}>
      <div className={`carousel-3d-wrapper ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
        <div className="carousel-3d-container">
          {days.map((date, index) => {
            const position = getPositionFromCenter(index);
            const isCenter = position === 0;
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            return (
              <div
                key={format(date, 'yyyy-MM-dd')}
                className={`carousel-3d-card ${isCenter ? 'is-center' : ''} ${isToday ? 'is-today' : ''}`}
                data-position={position}
              >
                {!isCenter && (
                  <div
                    className="absolute inset-0 z-50 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); handleDayCardClick(index); }}
                  />
                )}
                <div className={`day-card bg-background rounded-2xl shadow-lg border border-border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
                  <TimeGrid {...buildTimeGridProps(date, true, isCenter)} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="carousel-3d-indicators">
          {days.map((date, index) => {
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            return (
              <button
                key={format(date, 'yyyy-MM-dd')}
                className={`carousel-3d-dot ${index === centerIndex ? 'active' : ''} ${isToday ? 'is-today' : ''}`}
                onClick={() => setCenterIndex(index)}
                aria-label={format(date, 'EEEE d MMMM')}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomCalendar;
