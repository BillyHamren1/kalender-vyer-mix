
import React, { useRef, useEffect, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceHeaderDropZone from './ResourceHeaderDropZone';
import { useEventMarking } from '@/hooks/useEventMarking';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import MarkedEventOverlay from './MarkedEventOverlay';
import TimeAxisOverlay from './TimeAxisOverlay';
import MarkingModeIndicator from './MarkingModeIndicator';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (resourceId: string, resourceTitle: string) => void;
  forceRefresh?: boolean;
  key?: string;
  droppableScope?: string;
  calendarProps?: any;
  targetDate?: Date;
  staffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{id: string, name: string, color?: string}>;
  };
}

const ResourceCalendar: React.FC<ResourceCalendarProps> = ({
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
  droppableScope = 'resource-calendar',
  calendarProps = {},
  targetDate,
  staffOperations
}) => {
  const calendarRef = useRef<FullCalendar>(null);
  const effectiveDate = targetDate || currentDate;
  
  // Use event marking hook
  const {
    markedEvent,
    timeSelection,
    isUpdating,
    markEvent,
    unmarkEvent,
    handleTimeSlotClick
  } = useEventMarking();

  // Use event navigation with marking mode
  const { handleEventClick: navigationHandler } = useEventNavigation(
    !!markedEvent,
    markEvent
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && markedEvent) {
        unmarkEvent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markedEvent, unmarkEvent]);

  // Refresh events after update
  useEffect(() => {
    if (!isUpdating && refreshEvents) {
      refreshEvents();
    }
  }, [isUpdating]);

  // Custom header content that includes staff assignments with colors
  const customResourceLabelContent = useCallback((arg: any) => {
    const resourceId = arg.resource.id;
    const resourceTitle = arg.resource.title;
    
    // Get staff with color information for this team using passed-in operations
    const assignedStaffRaw = staffOperations 
      ? staffOperations.getStaffForTeamAndDate(resourceId, effectiveDate)
      : [];
    const assignedStaff = Array.isArray(assignedStaffRaw) ? assignedStaffRaw : [];
    
    console.log(`ResourceCalendar: Staff for team ${resourceId}:`, assignedStaff);
    
    return (
      <ResourceHeaderDropZone
        resource={{ 
          id: resourceId, 
          title: resourceTitle,
          eventColor: arg.resource.eventColor || '#3b82f6'
        }}
        currentDate={currentDate}
        targetDate={effectiveDate}
        onStaffDrop={onStaffDrop}
        onSelectStaff={onSelectStaff}
        assignedStaff={assignedStaff}
        minHeight={100}
      />
    );
  }, [currentDate, effectiveDate, onStaffDrop, onSelectStaff, staffOperations]);

  // Handle time slot clicks on the time axis
  const handleDateClick = useCallback((info: any) => {
    if (!markedEvent) return;
    
    // Get the clicked time
    const clickedTime = info.date;
    handleTimeSlotClick(clickedTime);
  }, [markedEvent, handleTimeSlotClick]);

  // Custom event class names to highlight marked event
  const eventClassNames = useCallback((info: any) => {
    const classes = [];
    if (markedEvent && info.event.id === markedEvent.id) {
      classes.push('marked-event');
    }
    return classes;
  }, [markedEvent]);

  // Calendar configuration
  const calendarOptions = {
    plugins: [resourceTimeGridPlugin, interactionPlugin],
    initialView: 'resourceTimeGridDay',
    resources: resources,
    events: events,
    resourceLabelContent: customResourceLabelContent,
    headerToolbar: false,
    allDaySlot: false,
    slotMinTime: '06:00:00',
    slotMaxTime: '22:00:00',
    slotDuration: '01:00:00',
    height: 'auto',
    resourceAreaWidth: '80px',
    resourceAreaHeaderContent: 'Teams',
    eventDisplay: 'block',
    datesSet: onDateSet,
    dateClick: handleDateClick,
    eventClick: navigationHandler,
    eventClassNames: eventClassNames,
    ...calendarProps
  };

  useEffect(() => {
    if (calendarRef.current && forceRefresh) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.refetchEvents();
      calendarApi.refetchResources();
    }
  }, [forceRefresh]);

  return (
    <>
      {markedEvent && (
        <>
          <MarkedEventOverlay
            markedEvent={markedEvent}
            timeSelection={timeSelection}
            onCancel={unmarkEvent}
          />
          <MarkingModeIndicator 
            step={timeSelection.startTime ? 'end' : 'start'} 
          />
        </>
      )}
      
      <div className="resource-calendar-container relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading calendar...</div>
          </div>
        ) : (
          <>
            <FullCalendar
              ref={calendarRef}
              {...calendarOptions}
            />
            {markedEvent && (
              <TimeAxisOverlay 
                onTimeClick={handleTimeSlotClick}
                currentDate={effectiveDate}
              />
            )}
          </>
        )}
      </div>
      
      <style>{`
        .marked-event {
          border: 3px solid hsl(var(--primary)) !important;
          box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary)) !important;
          z-index: 100 !important;
          animation: pulse-border 2s ease-in-out infinite;
        }
        
        @keyframes pulse-border {
          0%, 100% {
            border-color: hsl(var(--primary));
          }
          50% {
            border-color: hsl(var(--primary) / 0.5);
          }
        }
        
        .fc-timegrid-slot:hover {
          background-color: hsl(var(--accent)) !important;
          cursor: pointer;
        }
        
        .resource-calendar-container.marking-mode .fc-timegrid-axis {
          background-color: hsl(var(--primary) / 0.1) !important;
          border-left: 3px solid hsl(var(--primary)) !important;
        }
      `}</style>
    </>
  );
};

export default ResourceCalendar;
