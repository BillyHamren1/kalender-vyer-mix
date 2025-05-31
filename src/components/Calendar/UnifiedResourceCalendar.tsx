
import React, { useEffect, useState, useRef } from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceCalendar from './ResourceCalendar';
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { CalendarContext } from '@/App';
import './WeeklyCalendarStyles.css';

interface UnifiedResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string, targetDate?: Date) => void;
  forceRefresh?: number | boolean;
  viewMode: 'weekly' | 'monthly';
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
  viewMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setLastViewedDate } = useContext(CalendarContext);

  // Generate days based on view mode
  const getDaysToRender = () => {
    if (viewMode === 'weekly') {
      // Generate 7 days starting from currentDate (Monday of the week)
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

  // ULTRA-COMPREHENSIVE EVENT DEBUGGING
  console.log('=== UnifiedResourceCalendar ULTRA DEBUG ===');
  console.log(`View mode: ${viewMode}`);
  console.log(`Current date: ${format(currentDate, 'yyyy-MM-dd')}`);
  console.log(`Total events received: ${events.length}`);
  console.log(`Available resources: ${resources.length}`, resources.map(r => ({ id: r.id, title: r.title })));
  
  // Log EVERY single event received
  console.log('🔍 ALL EVENTS PASSED TO UNIFIED CALENDAR:');
  events.forEach((event, index) => {
    console.log(`Event ${index + 1}:`, {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      resourceId: event.resourceId,
      startFormatted: format(event.start, 'yyyy-MM-dd HH:mm:ss'),
      endFormatted: format(event.end, 'yyyy-MM-dd HH:mm:ss')
    });
  });
  
  if (events.length === 0) {
    console.error('🚨 CRITICAL: UnifiedResourceCalendar received ZERO events!');
    console.error('This means the issue is upstream - events are not reaching this component');
  }

  // CRITICAL: Check for resource ID mismatches with DETAILED analysis
  const resourceIds = resources.map(r => r.id);
  console.log('🎯 Available resource IDs:', resourceIds);
  
  const eventResourceIds = [...new Set(events.map(e => e.resourceId))];
  console.log('🎯 Event resource IDs:', eventResourceIds);
  
  const eventsWithInvalidResources = events.filter(event => 
    !resources.find(resource => resource.id === event.resourceId)
  );
  if (eventsWithInvalidResources.length > 0) {
    console.error('🚨 EVENTS WITH INVALID RESOURCE IDS:', eventsWithInvalidResources);
    console.error('🚨 These events will likely be filtered out by FullCalendar!');
  }

  // Check for date range issues
  const today = new Date();
  const weekStart = new Date(currentDate);
  const weekEnd = new Date(currentDate);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  console.log('📅 Date range analysis:');
  console.log(`Today: ${format(today, 'yyyy-MM-dd')}`);
  console.log(`Week start: ${format(weekStart, 'yyyy-MM-dd')}`);
  console.log(`Week end: ${format(weekEnd, 'yyyy-MM-dd')}`);
  
  const eventsInRange = events.filter(event => {
    const eventDate = new Date(event.start);
    return eventDate >= weekStart && eventDate <= weekEnd;
  });
  
  console.log(`📊 Events in current week range: ${eventsInRange.length} out of ${events.length}`);

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

  // Create a wrapper for refreshEvents that returns Promise<void>
  const wrappedRefreshEvents = async (): Promise<void> => {
    await refreshEvents();
  };

  // Common calendar props for weekly view - optimized for team columns
  const getWeeklyCalendarProps = () => {
    const teamCount = resources.length;
    const optimizedTeamWidth = 100; // Optimized width per team column
    const timeColumnWidth = 60;
    const totalCalendarWidth = timeColumnWidth + (teamCount * optimizedTeamWidth);
    
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      // Resource configuration with optimized widths
      resourceAreaWidth: optimizedTeamWidth,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: optimizedTeamWidth
        }
      ],
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: optimizedTeamWidth,
      contentHeight: 'auto',
      expandRows: true,
      aspectRatio: 1.2,
      // Ensure proper sizing
      width: totalCalendarWidth,
      minWidth: totalCalendarWidth
    };
  };

  // Common calendar props for monthly view
  const getMonthlyCalendarProps = () => {
    return {
      height: 'auto',
      headerToolbar: false,
      allDaySlot: false,
      initialView: 'resourceTimeGridDay',
      resourceAreaWidth: 120,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: 120
        }
      ],
      resourceLabelText: 'Teams',
      resourceAreaHeaderContent: 'Teams',
      stickyResourceAreaHeaders: true,
      resourceOrder: 'title',
      resourcesInitiallyExpanded: true,
      slotMinWidth: 120,
      contentHeight: 'auto',
      expandRows: true,
      aspectRatio: 1.35,
    };
  };

  // CRITICAL FIX: For weekly view, pass ALL events to each calendar and let FullCalendar handle date filtering
  // For monthly view, filter events by specific day
  const getEventsForDay = (date: Date): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    if (viewMode === 'weekly') {
      // CRITICAL FIX: For weekly view, pass ALL events and let FullCalendar handle filtering
      console.log(`📅 Weekly view: Passing all ${events.length} events to ${dateStr} calendar`);
      console.log(`📋 Events being passed for ${dateStr}:`, events.map(e => ({ 
        id: e.id, 
        title: e.title, 
        start: format(e.start, 'yyyy-MM-dd HH:mm'), 
        end: format(e.end, 'yyyy-MM-dd HH:mm'), 
        resourceId: e.resourceId 
      })));
      return events;
    } else {
      // Monthly view: Filter events for specific day
      const dayEvents = events.filter(event => {
        const eventStart = new Date(event.start);
        const eventDateStr = format(eventStart, 'yyyy-MM-dd');
        const matches = eventDateStr === dateStr;
        
        if (matches) {
          console.log(`✅ Event ${event.id} matches date ${dateStr}`);
        }
        
        return matches;
      });
      
      console.log(`Monthly view: Events for ${dateStr}: ${dayEvents.length} events`);
      if (dayEvents.length > 0) {
        console.log('Monthly day events:', dayEvents.map(e => ({ 
          id: e.id, 
          title: e.title,
          start: format(e.start, 'yyyy-MM-dd HH:mm'),
          resourceId: e.resourceId
        })));
      }
      return dayEvents;
    }
  };

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

  // Weekly view - single row with 7 columns
  if (viewMode === 'weekly') {
    const teamCount = resources.length;
    const optimizedTeamWidth = 100;
    const timeColumnWidth = 60;
    const totalDayWidth = timeColumnWidth + (teamCount * optimizedTeamWidth);
    
    return (
      <div className="weekly-view-container">
        <div className="weekly-calendar-container" ref={containerRef}>
          {days.map((date, index) => {
            const dayEvents = getEventsForDay(date);
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            const resourceCalendarForceRefresh = numericForceRefresh > 0;
            const dateStr = format(date, 'yyyy-MM-dd');
            
            console.log(`=== Rendering weekly calendar for ${dateStr} ===`);
            console.log(`🎯 Events passed to ResourceCalendar: ${dayEvents.length}`);
            console.log(`📊 Resources: ${resources.length}`);
            console.log(`⚙️ Calendar props:`, getWeeklyCalendarProps());
            
            if (dayEvents.length === 0) {
              console.warn(`⚠️ No events for ${dateStr} - this might be why calendar appears empty`);
            } else {
              console.log(`✅ Events for ${dateStr}:`, dayEvents.map(e => e.title));
            }
            
            return (
              <div 
                key={dateStr} 
                className="day-calendar-wrapper"
                ref={isToday ? todayRef : null}
                style={{
                  width: `${totalDayWidth}px`,
                  minWidth: `${totalDayWidth}px`,
                  maxWidth: `${totalDayWidth}px`,
                  flex: '0 0 auto'
                }}
              >
                {/* Day header */}
                <div 
                  className={`day-header ${isToday ? 'today' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
                  onClick={() => handleDayHeaderClick(date)}
                  title="Click to view resource schedule"
                >
                  <div>{format(date, 'EEE d')}</div>
                </div>
                
                {/* Calendar content */}
                <div className="weekly-view-calendar">
                  <ResourceCalendar
                    events={dayEvents}
                    resources={resources}
                    isLoading={isLoading}
                    isMounted={isMounted}
                    currentDate={date}
                    onDateSet={handleNestedCalendarDateSet}
                    refreshEvents={wrappedRefreshEvents}
                    onStaffDrop={(staffId: string, resourceId: string | null) => handleStaffDrop(staffId, resourceId, date)}
                    onSelectStaff={(resourceId: string, resourceTitle: string) => handleSelectStaff(resourceId, resourceTitle, date)}
                    forceRefresh={resourceCalendarForceRefresh}
                    key={`calendar-${dateStr}-${numericForceRefresh}`}
                    droppableScope="weekly-calendar"
                    calendarProps={getWeeklyCalendarProps()}
                    targetDate={date}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Monthly view - grid layout
  return (
    <div className="monthly-grid-container">
      {days.map((date, index) => {
        const dayEvents = getEventsForDay(date);
        const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
        const isCurrentMonth = isSameMonth(date, currentDate);
        const resourceCalendarForceRefresh = numericForceRefresh > 0;
        const dateStr = format(date, 'yyyy-MM-dd');
        
        console.log(`UnifiedResourceCalendar: Rendering monthly calendar for ${dateStr} with ${dayEvents.length} events and ${resources.length} teams`);
        
        return (
          <div 
            key={dateStr} 
            className="monthly-day-wrapper"
            ref={isToday ? todayRef : null}
          >
            {/* Day header */}
            <div 
              className={`day-header ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''} cursor-pointer hover:bg-blue-50 transition-colors`}
              onClick={() => handleDayHeaderClick(date)}
              title="Click to view resource schedule"
            >
              <div>{format(date, 'EEE d')}</div>
            </div>
            
            {/* Calendar content */}
            <div className="monthly-view-calendar">
              <ResourceCalendar
                events={dayEvents}
                resources={resources}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={date}
                onDateSet={handleNestedCalendarDateSet}
                refreshEvents={wrappedRefreshEvents}
                onStaffDrop={(staffId: string, resourceId: string | null) => handleStaffDrop(staffId, resourceId, date)}
                onSelectStaff={(resourceId: string, resourceTitle: string) => handleSelectStaff(resourceId, resourceTitle, date)}
                forceRefresh={resourceCalendarForceRefresh}
                key={`calendar-${dateStr}-${numericForceRefresh}`}
                droppableScope="monthly-calendar"
                calendarProps={getMonthlyCalendarProps()}
                targetDate={date}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(UnifiedResourceCalendar);
