
import React, { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import { format } from 'date-fns';
import { CalendarEvent, Resource } from './ResourceData';
import { processEvents } from './CalendarEventProcessor';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import ResourceHeaderDropZone from './ResourceHeaderDropZone';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import {
  renderEventContent,
  setupEventActions,
  addEventAttributes,
  setupResourceHeaderStyles
} from './CalendarEventRenderer';
import { useResourceCalendarConfig } from '@/hooks/useResourceCalendarConfig';
import { useResourceCalendarHandlers } from '@/hooks/useResourceCalendarHandlers';
import { ResourceCalendarStyles } from './ResourceCalendarStyles';
import { toast } from 'sonner';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  onSelectStaff?: (teamId: string, teamName: string) => void;
  forceRefresh?: boolean;
  calendarProps?: Record<string, any>;
  droppableScope?: string;
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
  calendarProps = {},
  droppableScope = 'weekly-calendar',
  targetDate
}) => {
  const calendarRef = useRef<FullCalendar>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const [currentView, setCurrentView] = useState<string>('resourceTimeGridDay');
  const effectiveDate = targetDate || currentDate;

  console.log('=== ResourceCalendar Render Debug ===');
  console.log(`📅 Current date: ${format(effectiveDate, 'yyyy-MM-dd')}`);
  console.log(`📊 Events received: ${events.length}`, events.map(e => ({ id: e.id, title: e.title, start: e.start, end: e.end })));
  console.log(`🏢 Resources: ${resources.length}`, resources.map(r => ({ id: r.id, title: r.title })));

  // Process events with proper validation
  const processedEvents = React.useMemo(() => {
    console.log('🔄 Processing events for calendar...');
    if (!events || events.length === 0) {
      console.warn('⚠️ No events to process');
      return [];
    }
    
    const processed = processEvents(events, resources);
    console.log(`✅ Processed ${processed.length} events for display`);
    return processed;
  }, [events, resources]);

  // Get calendar configuration
  const { 
    calendarRef: configCalendarRef, 
    isMobile, 
    sortedResources, 
    getBaseCalendarProps 
  } = useResourceCalendarConfig(resources, droppableScope, calendarProps);

  // Get event handlers
  const {
    handleEventDrop,
    handleEventResize,
    handleEventChange,
    handleEventClick,
    handleEventReceive,
    handleDuplicateButtonClick,
    handleDeleteButtonClick,
    handleConfirmDelete,
    deleteDialogOpen,
    setDeleteDialogOpen,
    eventToDelete,
    isDeleting,
    DuplicateEventDialog
  } = useResourceCalendarHandlers(events, resources, refreshEvents);

  // Enhanced event after render handler
  const handleEventDidMount = (info: any) => {
    console.log('📌 Event mounted:', info.event.id, info.event.title);
    
    // Add event attributes for styling
    addEventAttributes(info);
    
    // Setup action buttons for events
    setupEventActions(info, handleDuplicateButtonClick, handleDeleteButtonClick);
  };

  // Resource after render handler
  const handleResourceDidMount = (info: any) => {
    setupResourceHeaderStyles(info);
  };

  // Date navigation handler
  const handleDatesSet = (dateInfo: any) => {
    console.log('📅 Calendar dates changed:', dateInfo);
    setSelectedDate(dateInfo.start);
    onDateSet(dateInfo);
  };

  // Build complete calendar configuration
  const calendarConfig = {
    ...getBaseCalendarProps(),
    // Core data
    events: processedEvents,
    resources: sortedResources,
    // Date and view settings
    initialDate: effectiveDate,
    date: effectiveDate,
    // CRITICAL: Enable all editing capabilities
    editable: true,
    eventStartEditable: true,
    eventDurationEditable: true,
    eventResizableFromStart: true,
    droppable: true,
    selectable: true,
    selectMirror: true,
    eventOverlap: true,
    selectOverlap: true,
    // Event handlers
    eventDidMount: handleEventDidMount,
    resourceDidMount: handleResourceDidMount,
    datesSet: handleDatesSet,
    eventChange: handleEventChange,
    eventDrop: handleEventDrop,
    eventResize: handleEventResize,
    eventClick: handleEventClick,
    eventReceive: handleEventReceive,
    // Content rendering
    eventContent: renderEventContent,
    // Time zone and formatting
    timeZone: 'local',
    eventTimeFormat: {
      hour: '2-digit' as '2-digit',
      minute: '2-digit' as '2-digit',
      hour12: false,
      meridiem: false
    },
    // Override any additional props
    ...calendarProps
  };

  console.log('🎯 Final calendar config:', {
    eventsCount: processedEvents.length,
    resourcesCount: sortedResources.length,
    editable: calendarConfig.editable,
    eventStartEditable: calendarConfig.eventStartEditable,
    eventDurationEditable: calendarConfig.eventDurationEditable,
    timeZone: calendarConfig.timeZone
  });

  if (isLoading && !isMounted) {
    return (
      <div className="calendar-loading">
        Loading calendar...
      </div>
    );
  }

  return (
    <div className="calendar-container">
      <ResourceCalendarStyles />
      
      <FullCalendar
        ref={calendarRef}
        {...calendarConfig}
      />

      {/* Delete confirmation dialog */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Event"
        description={`Are you sure you want to delete "${eventToDelete?.title}"? This action cannot be undone.`}
        isLoading={isDeleting}
      />

      {/* Duplicate event dialog */}
      <DuplicateEventDialog />
    </div>
  );
};

export default ResourceCalendar;
