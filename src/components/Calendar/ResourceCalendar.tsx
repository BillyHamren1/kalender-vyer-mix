
import React, { useRef, useEffect, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceHeaderDropZone from './ResourceHeaderDropZone';
import { updateCalendarEvent } from '@/services/eventService';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();

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

  // Handle event drop (drag and drop)
  const handleEventDrop = useCallback(async (info: any) => {
    const eventId = info.event.id;
    const newStart = info.event.start;
    const newEnd = info.event.end;
    const newResourceId = info.event.getResources()[0]?.id;

    console.log('ResourceCalendar: Event dropped', {
      eventId,
      newStart: newStart?.toISOString(),
      newEnd: newEnd?.toISOString(),
      newResourceId
    });

    try {
      await updateCalendarEvent(eventId, {
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        resourceId: newResourceId
      });

      const eventTitle = info.event.title;
      const resourceTitle = resources.find(r => r.id === newResourceId)?.title || 'Unknown';
      toast.success(`"${eventTitle}" moved to ${resourceTitle}`);
    } catch (error) {
      console.error('Error dropping event:', error);
      toast.error('Failed to move event');
      info.revert(); // Revert the drag if it failed
    }
  }, [resources]);

  // Handle event resize
  const handleEventResize = useCallback(async (info: any) => {
    const eventId = info.event.id;
    const newStart = info.event.start;
    const newEnd = info.event.end;

    console.log('ResourceCalendar: Event resized', {
      eventId,
      newStart: newStart?.toISOString(),
      newEnd: newEnd?.toISOString()
    });

    try {
      await updateCalendarEvent(eventId, {
        start: newStart.toISOString(),
        end: newEnd.toISOString()
      });

      toast.success('Event resized successfully');
    } catch (error) {
      console.error('Error resizing event:', error);
      toast.error('Failed to resize event');
      info.revert(); // Revert the resize if it failed
    }
  }, []);

  // Handle event click
  const handleEventClick = useCallback((info: any) => {
    const eventId = info.event.id;
    const bookingId = info.event.extendedProps?.bookingId || eventId;
    
    console.log('ResourceCalendar: Event clicked', { eventId, bookingId });
    
    if (bookingId) {
      navigate(`/booking/${bookingId}`);
    } else {
      toast.error('Could not find booking details');
    }
  }, [navigate]);

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
    snapDuration: '00:05:00', // Snap to 5-minute intervals
    height: 'auto',
    resourceAreaWidth: '80px',
    resourceAreaHeaderContent: 'Teams',
    eventDisplay: 'block',
    datesSet: onDateSet,
    // Enable drag and drop
    editable: true,
    droppable: true,
    eventResizableFromStart: true,
    // Event handlers
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    eventClick: handleEventClick,
    // Visual feedback
    eventOverlap: true,
    selectOverlap: true,
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
    <div className="resource-calendar-container">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      ) : (
        <FullCalendar
          ref={calendarRef}
          {...calendarOptions}
        />
      )}
    </div>
  );
};

export default ResourceCalendar;
