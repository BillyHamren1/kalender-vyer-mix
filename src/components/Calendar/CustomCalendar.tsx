import React, { useRef, useMemo, useCallback, useState } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format, addDays, getWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import TimeGrid from './TimeGrid';
import { useWeekDays } from '@/hooks/useWeekDays';
import { useCarouselState } from '@/hooks/useCarouselState';
import { useAvailableStaffWeek } from '@/hooks/useAvailableStaffWeek';
import { useStableEvents } from '@/hooks/useMemoizedEvents';
import { EditControllerProvider } from '@/contexts/EditControllerContext';
import { useEventDragDrop } from '@/hooks/useEventDragDrop';
import { extractUTCDate } from '@/utils/dateUtils';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import './Carousel3DStyles.css';

interface CustomCalendarProps {
  events: CalendarEvent[];
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date, fromTeamId?: string) => Promise<void>;
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
  activatedStaffIds?: string[];
  activatedStaffByDate?: Record<string, string[]>;
  daysOverride?: Date[];
  getDayCardClassName?: (date: Date) => string | undefined;
  timeGridFullWidth?: boolean;
}

const CustomCalendar: React.FC<CustomCalendarProps> = ({
  events,
  setEvents,
  resources,
  isLoading,
  isMounted,
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
  onEventClick,
  activatedStaffIds,
  activatedStaffByDate,
  daysOverride,
  getDayCardClassName,
  timeGridFullWidth = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const weekStartTime = currentDate.getTime();
  const [staffExpanded, setStaffExpanded] = useState(false);
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);
  const computedWeekDays = useWeekDays(currentDate);
  const days = daysOverride ?? computedWeekDays;

  const {
    isDragging,
    dragOverDate,
    isMoving,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  } = useEventDragDrop(refreshEvents, setEvents);

  const stableEvents = useStableEvents(events);

  const filterByTag = variant === 'warehouse' ? 'Lager' : 'Montage';
  const { getAvailableStaffForDay } = useAvailableStaffWeek(
    days, weekStartTime, resources, weeklyStaffOperations, filterByTag, activatedStaffIds, activatedStaffByDate
  );

  const {
    centerIndex, setCenterIndex,
    getPositionFromCenter, navigateCarousel, handleDayCardClick
  } = useCarouselState(days, weekStartTime, containerRef, viewMode === 'day');

  const eventIndex = useMemo(() => {
    const index = new Map<string, CalendarEvent[]>();
    for (const event of stableEvents) {
      if (!event.start) continue;
      const dateStr = extractUTCDate(event.start);
      if (!dateStr) continue;
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

  if (isLoading && !isMounted) {
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
      onEventDrop: handleDrop,
      teamVisibilityProps: allTeams && onToggleTeamForDay ? {
        allTeams,
        visibleTeams,
        onToggleTeam: (teamId: string) => onToggleTeamForDay!(teamId, date)
      } : undefined,
      variant,
      isEventReadOnly,
      onEventClick,
      setEvents,
      fullWidth: timeGridFullWidth || fullWidth,
      availableStaff: getAvailableStaffForDay(date),
      staffExpanded,
      onToggleStaffExpanded: () => setStaffExpanded(prev => !prev),
      onTitleClick: (d: Date) => setExpandedDay(d),
      ...(isCenter ? {
        carouselNav: {
          onNavigateLeft: () => navigateCarousel('left'),
          onNavigateRight: () => navigateCarousel('right')
        }
      } : {})
    };
  };

  // Fullscreen popover för en specifik dag (öppnas via klick på dag-titeln)
  const expandedDayDialog = (
    <Dialog open={!!expandedDay} onOpenChange={(open) => !open && setExpandedDay(null)}>
      <DialogContent
        className="theme-purple max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 border-0 bg-background overflow-auto"
        style={{ width: '100vw', height: '100vh' }}
      >
        <DialogTitle className="sr-only">
          {expandedDay ? format(expandedDay, 'EEEE d MMMM yyyy') : 'Dag'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Helskärmsvy för vald dag
        </DialogDescription>
        {expandedDay && (
          <div className="w-full h-full flex flex-col fullscreen-day">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b bg-background">
              <CalendarIcon className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                {`Vecka ${getWeek(expandedDay, { weekStartsOn: 1 })}, ${format(expandedDay, 'MMMM yyyy', { locale: sv }).replace(/^./, c => c.toUpperCase())}`}
              </h2>
              <span className="text-sm text-muted-foreground ml-2">
                {format(expandedDay, 'EEEE d MMMM', { locale: sv })}
              </span>
            </div>
            <div className={`flex-1 p-4 overflow-auto ${getDayCardClassName?.(expandedDay) ?? ''}`.trim()}>
              <TimeGrid
                {...buildTimeGridProps(expandedDay, true)}
                onTitleClick={undefined}
                staffExpanded={true}
                onToggleStaffExpanded={undefined}
                carouselNav={{
                  onNavigateLeft: () => setExpandedDay((d) => (d ? addDays(d, -1) : d)),
                  onNavigateRight: () => setExpandedDay((d) => (d ? addDays(d, 1) : d)),
                }}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // Weekly/Monthly mode
  if (isWeeklyMode) {
    return (
      <EditControllerProvider>
        <div className="custom-calendar-container weekly-view" ref={containerRef}>
          <div className={`weekly-horizontal-grid ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
            {days.map((date) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
              const isDropTarget = isDragging && dragOverDate === dateStr;
              return (
                <div
                  key={dateStr}
                  className={`weekly-day-card ${isToday ? 'is-today' : ''} ${getDayCardClassName?.(date) ?? ''}`.trim()}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, dateStr)}
                  onDragLeave={(e) => handleDragLeave(e, dateStr)}
                  onDrop={(e) => handleDrop(e, dateStr)}
                >
                  <TimeGrid {...buildTimeGridProps(date, false)} />
                </div>
              );
            })}
          </div>
        </div>
        {expandedDayDialog}
      </EditControllerProvider>
    );
  }

  // Day mode: 3D Carousel
  return (
    <EditControllerProvider>
      <div className="custom-calendar-container" ref={containerRef}>
        <div className={`carousel-3d-wrapper ${variant === 'warehouse' ? 'warehouse-theme' : ''}`}>
          <div className="carousel-3d-container">
            {days.map((date, index) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const position = getPositionFromCenter(index);
              const isCenter = position === 0;
              const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
              const isDropTarget = isDragging && dragOverDate === dateStr;
              return (
                <div
                  key={dateStr}
                  className={`carousel-3d-card ${isCenter ? 'is-center' : ''} ${isToday ? 'is-today' : ''}`}
                  data-position={position}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, dateStr)}
                  onDragLeave={(e) => handleDragLeave(e, dateStr)}
                  onDrop={(e) => handleDrop(e, dateStr)}
                >
                  {!isCenter && (
                    <div
                      className="absolute inset-0 z-50 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); handleDayCardClick(index); }}
                    />
                  )}
                  <TimeGrid {...buildTimeGridProps(date, true, isCenter)} />
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
      {expandedDayDialog}
    </EditControllerProvider>
  );
};

export default CustomCalendar;
