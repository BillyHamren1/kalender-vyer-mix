import React, { useEffect, useState } from 'react';
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

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
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
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const [currentView, setCurrentView] = useState<string>("resourceTimeGridDay");
  
  // Use targetDate if provided, otherwise fall back to currentDate
  const effectiveDate = targetDate || currentDate;
  
  console.log(`ResourceCalendar: Rendering for date ${format(effectiveDate, 'yyyy-MM-dd')} with target date: ${targetDate ? format(targetDate, 'yyyy-MM-dd') : 'none'}`);
  
  // Use the reliable staff operations hook for real-time updates
  const { assignments, handleStaffDrop: reliableHandleStaffDrop, getStaffForTeam } = useReliableStaffOperations(effectiveDate);
  
  // Use calendar configuration hook
  const { calendarRef, isMobile, getBaseCalendarProps } = useResourceCalendarConfig(
    resources,
    droppableScope,
    calendarProps
  );

  // Create a wrapper function that ensures Promise<void> return type
  const wrappedRefreshEvents = async (): Promise<void> => {
    await refreshEvents();
  };

  // Use calendar handlers hook
  const {
    handleEventDrop,
    handleEventChange,
    handleEventClick,
    handleEventReceive,
    handleDuplicateButtonClick,
    handleDeleteButtonClick,
    handleConfirmDelete,
    deleteDialogOpen,
    setDeleteDialogOpen,
    eventToDelete,
    DuplicateEventDialog
  } = useResourceCalendarHandlers(events, resources, wrappedRefreshEvents);

  // Log events and resources for debugging
  useEffect(() => {
    console.log('ResourceCalendar received events:', events);
    console.log('ResourceCalendar received resources:', resources);
    console.log('ResourceCalendar staff assignments:', assignments);
  }, [events, resources, assignments]);

  // Process events to ensure valid resources and add styling
  const processedEvents = processEvents(events, resources);

  // Custom resource header content renderer with target date
  const resourceHeaderContent = (info: any) => {
    if (isMobile) return info.resource.title;
    
    console.log(`ResourceCalendar: Rendering ResourceHeaderDropZone for ${info.resource.id} with target date: ${format(effectiveDate, 'yyyy-MM-dd')}`);
    
    // Get staff data from reliable staff operations
    const assignedStaff = getStaffForTeam(info.resource.id);
    const minHeight = 80;
    
    return (
      <ResourceHeaderDropZone 
        resource={info.resource}
        currentDate={effectiveDate}
        targetDate={effectiveDate}
        onStaffDrop={reliableHandleStaffDrop}
        onSelectStaff={onSelectStaff}
        assignedStaff={assignedStaff}
        minHeight={minHeight}
      />
    );
  };

  // Handle team selection with target date
  const handleSelectStaff = (resourceId: string, resourceTitle: string) => {
    console.log('ResourceCalendar.handleSelectStaff called with:', resourceId, resourceTitle, 'for target date:', format(effectiveDate, 'yyyy-MM-dd'));
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    } else {
      console.error('ResourceCalendar: onSelectStaff prop is not defined');
    }
  };

  // Create the full calendar props
  const fullCalendarProps = {
    ...getBaseCalendarProps(),
    events: processedEvents,
    eventDrop: handleEventDrop,
    eventResize: handleEventChange, // Enable event resizing for time changes
    eventClick: handleEventClick,
    eventReceive: handleEventReceive,
    // Enable event interaction
    editable: true,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: false,
    weekends: true,
    datesSet: (dateInfo: any) => {
      setSelectedDate(dateInfo.start);
      onDateSet(dateInfo);
      setCurrentView(dateInfo.view.type);
    },
    initialDate: currentDate,
    eventContent: renderEventContent,
    eventDidMount: (info: any) => {
      addEventAttributes(info);
      setupEventActions(info, handleDuplicateButtonClick, handleDeleteButtonClick);
    },
    resourceLabelDidMount: setupResourceHeaderStyles,
    resourceLabelContent: resourceHeaderContent,
    slotLabelDidMount: (info: any) => {
      info.el.style.zIndex = '1';
    },
  };

  return (
    <div className="calendar-container">
      {/* Add custom styles for address wrapping and FIXED column widths */}
      <ResourceCalendarStyles />
      
      <FullCalendar {...fullCalendarProps} />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
      
      {/* Delete confirmation dialog */}
      <ConfirmationDialog
        title="Delete Event"
        description={`Are you sure you want to delete "${eventToDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
      >
        <div />
      </ConfirmationDialog>
    </div>
  );
};

export default ResourceCalendar;
