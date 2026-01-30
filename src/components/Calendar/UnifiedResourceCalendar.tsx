import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { CalendarContext } from '@/App';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './Carousel3DStyles.css';
import './WeeklyCalendarStyles.css';

interface UnifiedResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string, targetDate?: Date) => void;
  forceRefresh?: number | boolean;
  viewMode: 'day' | 'weekly' | 'monthly';
  staffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => any[];
  };
  visibleTeams?: string[];
  selectedDate?: Date | null;
}

const UnifiedResourceCalendar: React.FC<UnifiedResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  refreshEvents,
  onStaffDrop,
  onSelectStaff,
  forceRefresh,
  viewMode,
  staffOperations,
  visibleTeams,
  selectedDate
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const selectedDateRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setLastViewedDate } = useContext(CalendarContext);

  // 3D Carousel state - center index (default to middle day, index 3 for 7-day week)
  const [centerIndex, setCenterIndex] = useState(3);

  // Generate days based on view mode
  const getDaysToRender = () => {
    if (viewMode === 'day' || viewMode === 'weekly') {
      // Generate 7 days starting from currentDate (for both day carousel and weekly grid)
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() + i);
        return date;
      });
    } else {
      // Monthly view - generate all days in the month
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(monthStart);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
      
      return eachDayOfInterval({
        start: calendarStart,
        end: calendarEnd
      });
    }
  };

  const days = getDaysToRender();

  // Convert forceRefresh to number for consistent handling
  const numericForceRefresh = typeof forceRefresh === 'boolean' ? (forceRefresh ? 1 : 0) : (forceRefresh || 0);

  // Calculate position relative to center for 3D carousel
  const getPositionFromCenter = useCallback((dayIndex: number): string => {
    const position = dayIndex - centerIndex;
    if (position === 0) return '0';
    if (position === 1) return '1';
    if (position === -1) return '-1';
    if (position === 2) return '2';
    if (position === -2) return '-2';
    if (position === 3) return '3';
    if (position === -3) return '-3';
    if (position > 3) return 'hidden-right';
    if (position < -3) return 'hidden-left';
    return '0';
  }, [centerIndex]);

  // Handle day card click to center it
  const handleDayCardClick = useCallback((dayIndex: number) => {
    if (dayIndex !== centerIndex) {
      setCenterIndex(dayIndex);
    }
  }, [centerIndex]);

  // Navigate carousel left
  const handleNavigateLeft = useCallback(() => {
    setCenterIndex(prev => Math.max(0, prev - 1));
  }, []);

  // Navigate carousel right
  const handleNavigateRight = useCallback(() => {
    setCenterIndex(prev => Math.min(days.length - 1, prev + 1));
  }, [days.length]);

  // Handle wheel scroll for carousel navigation (only in day view)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (viewMode !== 'day') return;
    
    // Use horizontal scroll or vertical scroll
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    
    if (Math.abs(delta) > 30) {
      e.preventDefault();
      if (delta > 0) {
        setCenterIndex(prev => Math.min(days.length - 1, prev + 1));
      } else {
        setCenterIndex(prev => Math.max(0, prev - 1));
      }
    }
  }, [days.length, viewMode]);

  // Filter resources based on visibleTeams only (strict filtering)
  const getFilteredResourcesForDay = (date: Date): Resource[] => {
    console.log('🔍 getFilteredResourcesForDay called:', {
      visibleTeams,
      totalResources: resources.length,
      resourceIds: resources.map(r => r.id)
    });

    if (!visibleTeams || visibleTeams.length === 0) {
      console.log('⚠️ No visibleTeams defined, showing all resources');
      return resources;
    }

    const filtered = resources.filter(resource => visibleTeams.includes(resource.id));
    console.log('✅ Filtered resources:', {
      filtered: filtered.length,
      filteredIds: filtered.map(r => r.id)
    });
    
    return filtered;
  };

  console.log(`UnifiedResourceCalendar: ${viewMode} view with ${events.length} events, forceRefresh: ${numericForceRefresh}`);

  // Calculate day width for weekly view
  const getDayWidth = () => {
    if (viewMode === 'weekly' && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dayWidth = Math.floor(containerWidth / 7);
      return dayWidth;
    }
    return 'auto';
  };

  // Handle day header click to navigate to resource view
  const handleDayHeaderClick = (date: Date) => {
    // Store the selected date in context and session storage
    setLastViewedDate(date);
    sessionStorage.setItem('calendarDate', date.toISOString());
    
    // Navigate to the resource view
    navigate('/resource-view');
  };

  // Handle staff drop - CRITICAL: Always pass the exact day date
  const handleStaffDrop = async (staffId: string, resourceId: string | null, dayDate: Date) => {
    console.log(`UnifiedResourceCalendar.handleStaffDrop: staffId=${staffId}, resourceId=${resourceId || 'null'}, date=${format(dayDate, 'yyyy-MM-dd')}`);
    
    if (onStaffDrop) {
      try {
        // IMPORTANT: Always pass the specific day date, never fallback to currentDate
        await onStaffDrop(staffId, resourceId, dayDate);
        console.log('UnifiedResourceCalendar: Staff drop operation successful for date:', format(dayDate, 'yyyy-MM-dd'));
      } catch (error) {
        console.error('UnifiedResourceCalendar: Error in handleStaffDrop:', error);
      }
    }
  };

  // Handle nested calendar date changes
  const handleNestedCalendarDateSet = (dateInfo: any) => {
    // Pass through to parent onDateSet handler
    onDateSet(dateInfo);
  };

  // Enhanced team selection handler - CRITICAL: Always pass the exact day date
  const handleSelectStaff = (resourceId: string, resourceTitle: string, dayDate: Date) => {
    console.log('UnifiedResourceCalendar.handleSelectStaff called with:', resourceId, resourceTitle, 'for date:', format(dayDate, 'yyyy-MM-dd'));
    if (onSelectStaff) {
      // IMPORTANT: Always pass the specific day date, never fallback to currentDate
      onSelectStaff(resourceId, resourceTitle, dayDate);
    } else {
      console.error('UnifiedResourceCalendar: onSelectStaff prop is not defined');
    }
  };

  // Helper function to ensure consistent resource column configuration
  const getResourceTimeGridOptions = () => {
    return {
      resourceAreaWidth: '80px',
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: '80px'
    };
  };

  // Common calendar props to ensure consistency across all day calendars
  const getCommonCalendarProps = (dayIndex: number) => {
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: '80px',
      slotMinWidth: '80px',
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: '80px'
        }
      ],
      ...getResourceTimeGridOptions(),
      'data-day-index': dayIndex.toString(),
    };
  };

  // Filter events for each specific day to prevent duplicates
  const getEventsForDay = (date: Date): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayEvents = events.filter(event => {
      const eventStart = new Date(event.start);
      const eventDateStr = format(eventStart, 'yyyy-MM-dd');
      return eventDateStr === dateStr;
    });
    
    console.log(`UnifiedResourceCalendar: Events for ${dateStr}: ${dayEvents.length} events`);
    return dayEvents;
  };

  // Scroll to selected date when switching from monthly to weekly view
  useEffect(() => {
    if (viewMode === 'weekly' && selectedDate && selectedDateRef.current) {
      const timer = setTimeout(() => {
        selectedDateRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedDate, viewMode]);

  // Scroll to today for monthly view
  useEffect(() => {
    if (viewMode === 'monthly' && todayRef.current) {
      const timer = setTimeout(() => {
        todayRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentDate, viewMode]);

  // Get container class based on view mode
  const getContainerClass = () => {
    if (viewMode === 'day') {
      return 'weekly-view-container'; // 3D carousel container
    } else if (viewMode === 'weekly') {
      return 'weekly-grid-view-container'; // New grid view container
    } else {
      return 'monthly-grid-container';
    }
  };

  const getCalendarContainerClass = () => {
    if (viewMode === 'day') {
      return 'carousel-3d-wrapper'; // 3D carousel
    } else if (viewMode === 'weekly') {
      return 'weekly-grid-wrapper'; // New grid view
    } else {
      return 'monthly-calendar-grid';
    }
  };

  // Day View - 3D Carousel
  if (viewMode === 'day') {
    return (
      <div className={getContainerClass()}>
        <div 
          className={getCalendarContainerClass()} 
          ref={containerRef}
          onWheel={handleWheel}
        >
          {/* Navigation Buttons */}
          <button
            className="carousel-3d-nav nav-left"
            onClick={handleNavigateLeft}
            disabled={centerIndex === 0}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <button
            className="carousel-3d-nav nav-right"
            onClick={handleNavigateRight}
            disabled={centerIndex === days.length - 1}
            aria-label="Next day"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* 3D Carousel Container */}
          <div className="carousel-3d-container">
            {days.map((date, index) => {
              const dayEvents = getEventsForDay(date);
              const filteredResources = getFilteredResourcesForDay(date);
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              const isSelectedDate = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
              const position = getPositionFromCenter(index);
              const resourceCalendarForceRefresh = numericForceRefresh > 0;
              
              return (
                <div
                  key={format(date, 'yyyy-MM-dd')}
                  className="carousel-3d-card"
                  data-position={position}
                  onClick={() => position !== '0' && handleDayCardClick(index)}
                  style={{
                    cursor: position !== '0' ? 'pointer' : 'default'
                  }}
                >
                  <div 
                    className="day-calendar-wrapper"
                    ref={isToday ? todayRef : (isSelectedDate ? selectedDateRef : null)}
                  >
                    {/* Clickable day header */}
                    <div 
                      className={`day-header ${isToday ? 'today' : ''} ${isSelectedDate ? 'selected-date' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDayHeaderClick(date);
                      }}
                      title="Click to view resource schedule"
                    >
                      <div>{format(date, 'EEE d')}</div>
                    </div>
                    <div className="weekly-view-calendar">
                      <ResourceCalendar
                        events={dayEvents}
                        resources={filteredResources}
                        isLoading={isLoading}
                        isMounted={isMounted}
                        currentDate={date}
                        onDateSet={handleNestedCalendarDateSet}
                        refreshEvents={refreshEvents}
                        onStaffDrop={(staffId: string, resourceId: string | null) => handleStaffDrop(staffId, resourceId, date)}
                        onSelectStaff={(resourceId: string, resourceTitle: string) => handleSelectStaff(resourceId, resourceTitle, date)}
                        forceRefresh={resourceCalendarForceRefresh}
                        key={`calendar-${format(date, 'yyyy-MM-dd')}-${numericForceRefresh}`}
                        droppableScope="weekly-calendar"
                        calendarProps={getCommonCalendarProps(index)}
                        targetDate={date}
                        staffOperations={staffOperations}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Indicator Dots */}
          <div className="carousel-3d-indicators">
            {days.map((date, index) => (
              <button
                key={format(date, 'yyyy-MM-dd')}
                className={`carousel-3d-dot ${index === centerIndex ? 'active' : ''}`}
                onClick={() => setCenterIndex(index)}
                aria-label={`Go to ${format(date, 'EEEE')}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Weekly View - 7 days side by side in a grid
  if (viewMode === 'weekly') {
    return (
      <div className={getContainerClass()}>
        <div className={getCalendarContainerClass()} ref={containerRef}>
          {days.map((date, index) => {
            const dayEvents = getEventsForDay(date);
            const filteredResources = getFilteredResourcesForDay(date);
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            const isSelectedDate = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
            const resourceCalendarForceRefresh = numericForceRefresh > 0;
            
            return (
              <div
                key={format(date, 'yyyy-MM-dd')}
                className={`weekly-grid-day ${isToday ? 'is-today' : ''} ${isSelectedDate ? 'is-selected' : ''}`}
                ref={isToday ? todayRef : (isSelectedDate ? selectedDateRef : null)}
              >
                <div className="weekly-grid-day-header">
                  <span className="day-name">{format(date, 'EEE')}</span>
                  <span className={`day-number ${isToday ? 'today-number' : ''}`}>{format(date, 'd')}</span>
                </div>
                <div className="weekly-grid-day-content">
                  <ResourceCalendar
                    events={dayEvents}
                    resources={filteredResources}
                    isLoading={isLoading}
                    isMounted={isMounted}
                    currentDate={date}
                    onDateSet={handleNestedCalendarDateSet}
                    refreshEvents={refreshEvents}
                    onStaffDrop={(staffId: string, resourceId: string | null) => handleStaffDrop(staffId, resourceId, date)}
                    onSelectStaff={(resourceId: string, resourceTitle: string) => handleSelectStaff(resourceId, resourceTitle, date)}
                    forceRefresh={resourceCalendarForceRefresh}
                    key={`calendar-${format(date, 'yyyy-MM-dd')}-${numericForceRefresh}`}
                    droppableScope="weekly-grid-calendar"
                    calendarProps={getCommonCalendarProps(index)}
                    targetDate={date}
                    staffOperations={staffOperations}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Monthly Grid View (unchanged)
  return (
    <div className={getContainerClass()}>
      <div className="monthly-calendar-grid" ref={containerRef}>
        {days.map((date, index) => {
          // Get only the events for this specific day
          const dayEvents = getEventsForDay(date);
          const filteredResources = getFilteredResourcesForDay(date);
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isSelectedDate = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(date, currentDate);
          
          // Convert forceRefresh to boolean for ResourceCalendar
          const resourceCalendarForceRefresh = numericForceRefresh > 0;
          
          console.log(`UnifiedResourceCalendar: Rendering calendar for ${format(date, 'yyyy-MM-dd')} with ${dayEvents.length} events and ${filteredResources.length} visible teams`);
          
          return (
            <div 
              key={format(date, 'yyyy-MM-dd')} 
              className="monthly-day-wrapper"
              ref={isToday ? todayRef : (isSelectedDate ? selectedDateRef : null)}
            >
              {/* Clickable day header */}
              <div 
                className={`day-header ${isToday ? 'today' : ''} ${isSelectedDate ? 'selected-date' : ''} ${!isCurrentMonth ? 'other-month' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
                onClick={() => handleDayHeaderClick(date)}
                title="Click to view resource schedule"
              >
                <div>{format(date, 'EEE d')}</div>
              </div>
              <div className="monthly-view-calendar">
                <ResourceCalendar
                  events={dayEvents}
                  resources={filteredResources}
                  isLoading={isLoading}
                  isMounted={isMounted}
                  currentDate={date}
                  onDateSet={handleNestedCalendarDateSet}
                  refreshEvents={refreshEvents}
                  onStaffDrop={(staffId: string, resourceId: string | null) => handleStaffDrop(staffId, resourceId, date)}
                  onSelectStaff={(resourceId: string, resourceTitle: string) => handleSelectStaff(resourceId, resourceTitle, date)}
                  forceRefresh={resourceCalendarForceRefresh}
                  key={`calendar-${format(date, 'yyyy-MM-dd')}-${numericForceRefresh}`}
                  droppableScope="monthly-calendar"
                  calendarProps={getCommonCalendarProps(index)}
                  targetDate={date}
                  staffOperations={staffOperations}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(UnifiedResourceCalendar);
