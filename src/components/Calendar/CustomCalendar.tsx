import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import TimeGrid from './TimeGrid';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  const currentWeekStart = currentDate;
  const containerRef = useRef<HTMLDivElement>(null);

  // IMPORTANT: memoize days so carousel state doesn't reset on every re-render
  const weekStartTime = currentWeekStart.getTime();
  const days = useMemo(() => {
    if (viewMode === 'day') {
      return [new Date(currentWeekStart)];
    }
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);
      return date;
    });
  }, [viewMode, weekStartTime]);

  // Find today's index in the days array
  const getTodayIndex = useCallback(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const index = days.findIndex(d => format(d, 'yyyy-MM-dd') === todayStr);
    return index >= 0 ? index : 3; // Fallback to middle of week
  }, [days]);

  // 3D Carousel state - centerIndex determines which day is in focus
  const [centerIndex, setCenterIndex] = useState(() => getTodayIndex());

  // Update centerIndex when week changes (to focus on today if it exists in the new week)
  useEffect(() => {
    setCenterIndex(getTodayIndex());
  }, [weekStartTime, getTodayIndex]);

  // Get position relative to center (-3 to +3) with circular wrapping
  const getPositionFromCenter = (index: number): number => {
    const totalDays = days.length;
    let diff = index - centerIndex;
    
    // Wrap around for circular carousel
    if (diff > totalDays / 2) {
      diff -= totalDays;
    } else if (diff < -totalDays / 2) {
      diff += totalDays;
    }
    
    // Clamp to -3 to +3 range for visual positions
    return Math.max(-3, Math.min(3, diff));
  };

  // Navigate carousel with circular wrapping
  const navigateCarousel = (direction: 'left' | 'right') => {
    setCenterIndex(prev => {
      if (direction === 'left') {
        return prev === 0 ? days.length - 1 : prev - 1;
      } else {
        return prev === days.length - 1 ? 0 : prev + 1;
      }
    });
  };

  // Handle click on a day card to bring it to center
  const handleDayCardClick = (index: number) => {
    if (index !== centerIndex) {
      setCenterIndex(index);
    }
  };

  // Handle mouse wheel for horizontal scrolling through carousel (circular)
  const handleWheel = useCallback((e: WheelEvent) => {
    // Only handle horizontal-like scrolling (shift+wheel or trackpad horizontal)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (delta > 0) {
        setCenterIndex(prev => prev === days.length - 1 ? 0 : prev + 1);
      } else {
        setCenterIndex(prev => prev === 0 ? days.length - 1 : prev - 1);
      }
    }
  }, [days.length]);

  // Attach wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (container && viewMode === 'weekly') {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel, viewMode]);

  const getEventsForDayAndResource = (date: Date, resourceId: string): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    return events.filter(event => {
      if (!event.start) {
        console.warn('Event missing start time:', event.id);
        return false;
      }
      
      const eventStart = new Date(event.start);
      
      if (isNaN(eventStart.getTime())) {
        console.error('Invalid event start date:', event.id, event.start);
        return false;
      }
      
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr && event.resourceId === resourceId;
    });
  };

  const handleEventResize = async () => {
    console.log('CustomCalendar: Manual refresh after resize');
    await refreshEvents();
  };

  const getFilteredResourcesForDay = (date: Date): Resource[] => {
    if (!getVisibleTeamsForDay) return resources;
    const visibleTeams = getVisibleTeamsForDay(date);
    return resources.filter(resource => visibleTeams.includes(resource.id));
  };

  const getDayWidth = (numTeams: number) => {
    const timeColumnWidth = 80;
    const minTeamColumnWidth = 128;
    return timeColumnWidth + (numTeams * minTeamColumnWidth);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading staff planning calendar...</div>
      </div>
    );
  }

  const isDayMode = viewMode === 'day';

  // In day mode, use traditional layout (no carousel)
  if (isDayMode) {
    const date = days[0];
    const filteredResources = getFilteredResourcesForDay(date);
    const visibleTeams = getVisibleTeamsForDay ? getVisibleTeamsForDay(date) : [];

    return (
      <div className="custom-calendar-container" ref={containerRef}>
        <div className="weekly-calendar-container p-4">
          <div className="weekly-calendar-grid">
            <div 
              className={`day-card bg-background rounded-2xl shadow-lg border border-border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''} w-full`}
            >
              <TimeGrid
                day={date}
                resources={filteredResources}
                events={events}
                getEventsForDayAndResource={getEventsForDayAndResource}
                onStaffDrop={onStaffDrop}
                onOpenStaffSelection={onOpenStaffSelection}
                dayWidth={undefined}
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
                fullWidth={true}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Weekly mode: 3D Carousel
  return (
    <div className="custom-calendar-container" ref={containerRef}>
      <div className={`carousel-3d-wrapper ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
        {/* Navigation arrows - always enabled for infinite carousel */}
        <button
          className="carousel-3d-nav nav-left"
          onClick={() => navigateCarousel('left')}
          aria-label="Föregående dag"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        
        <button
          className="carousel-3d-nav nav-right"
          onClick={() => navigateCarousel('right')}
          aria-label="Nästa dag"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* 3D Carousel container */}
        <div className="carousel-3d-container">
          {days.map((date, index) => {
            const filteredResources = getFilteredResourcesForDay(date);
            const visibleTeams = getVisibleTeamsForDay ? getVisibleTeamsForDay(date) : [];
            const position = getPositionFromCenter(index);
            const isCenter = position === 0;
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

            return (
              <div 
                key={format(date, 'yyyy-MM-dd')} 
                className={`carousel-3d-card ${isCenter ? 'is-center' : ''} ${isToday ? 'is-today' : ''}`}
                data-position={position}
              >
                {/* Clickable overlay for non-center cards */}
                {!isCenter && (
                  <div 
                    className="absolute inset-0 z-50 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDayCardClick(index);
                    }}
                  />
                )}
                <div className={`day-card bg-background rounded-2xl shadow-lg border border-border overflow-hidden ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
                  <TimeGrid
                    day={date}
                    resources={filteredResources}
                    events={events}
                    getEventsForDayAndResource={getEventsForDayAndResource}
                    onStaffDrop={onStaffDrop}
                    onOpenStaffSelection={onOpenStaffSelection}
                    dayWidth={undefined}
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
                    fullWidth={true}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Indicator dots */}
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
