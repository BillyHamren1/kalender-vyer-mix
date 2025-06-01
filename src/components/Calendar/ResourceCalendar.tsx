
import React, { useRef, useEffect, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarEvent, Resource } from './ResourceData';
import ResourceHeaderDropZone from './ResourceHeaderDropZone';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';

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
  targetDate
}) => {
  const calendarRef = useRef<FullCalendar>(null);
  const effectiveDate = targetDate || currentDate;
  const reliableStaffOps = useReliableStaffOperations(effectiveDate);

  // Custom header content that includes staff assignments with colors
  const customResourceLabelContent = useCallback((arg: any) => {
    const resourceId = arg.resource.id;
    const resourceTitle = arg.resource.title;
    
    // Get staff with color information for this team
    const assignedStaff = reliableStaffOps.getStaffForTeam(resourceId);
    
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
  }, [currentDate, effectiveDate, onStaffDrop, onSelectStaff, reliableStaffOps]);

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
