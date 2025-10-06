
import React, { useRef, useEffect, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent, Resource } from './ResourceData';
import CustomEvent from './CustomEvent';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
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

  // Custom header content - simplified without drop zones
  const customResourceLabelContent = useCallback((arg: any) => {
    const resourceId = arg.resource.id;
    const resourceTitle = arg.resource.title;
    
    // Get staff with color information for this team
    const assignedStaffRaw = staffOperations 
      ? staffOperations.getStaffForTeamAndDate(resourceId, effectiveDate)
      : [];
    const assignedStaff = Array.isArray(assignedStaffRaw) ? assignedStaffRaw : [];
    
    return (
      <div className="resource-header-simple" style={{ padding: '8px', minHeight: '100px' }}>
        <div className="text-sm font-medium mb-2">{resourceTitle}</div>
        <div className="space-y-1">
          {assignedStaff.map((staff: any) => (
            <div 
              key={staff.id}
              className="text-xs px-2 py-1 rounded"
              style={{ 
                backgroundColor: staff.color || '#E3F2FD',
                color: '#000'
              }}
            >
              {staff.name}
            </div>
          ))}
        </div>
      </div>
    );
  }, [currentDate, effectiveDate, staffOperations]);

  // Custom event content
  const eventContent = useCallback((eventInfo: any) => {
    return (
      <CustomEvent
        event={{
          id: eventInfo.event.id,
          title: eventInfo.event.title,
          start: eventInfo.event.start,
          end: eventInfo.event.end,
          resourceId: eventInfo.event._def.resourceIds?.[0] || '',
          bookingId: eventInfo.event.extendedProps?.bookingId,
          bookingNumber: eventInfo.event.extendedProps?.bookingNumber,
          eventType: eventInfo.event.extendedProps?.eventType,
          extendedProps: eventInfo.event.extendedProps
        }}
        resource={{ id: eventInfo.event._def.resourceIds?.[0] || '', title: '', eventColor: '' }}
        onEventResize={async () => {
          await refreshEvents();
        }}
      />
    );
  }, [refreshEvents]);

  // Calendar configuration
  const calendarOptions = {
    plugins: [resourceTimeGridPlugin, interactionPlugin],
    initialView: 'resourceTimeGridDay',
    timeZone: 'UTC',
    resources: resources,
    events: events,
    resourceLabelContent: customResourceLabelContent,
    eventContent: eventContent,
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
    <div className="resource-calendar-container relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading calendar...</div>
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
