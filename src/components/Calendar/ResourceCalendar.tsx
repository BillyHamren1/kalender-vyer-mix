
import React, { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from './ResourceData';
import { useCalendarEventHandlers } from '@/hooks/useCalendarEventHandlers';
import { processEvents } from './CalendarEventProcessor';
import { getCalendarViews, getCalendarOptions } from './CalendarConfig';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEventActions } from '@/hooks/useEventActions';
import { ResourceHeaderDropZone } from './ResourceHeaderDropZone';
import { useEventOperations } from '@/hooks/useEventOperations';
import { 
  renderEventContent, 
  setupEventActions, 
  addEventAttributes,
  setupResourceHeaderStyles 
} from './CalendarEventRenderer';
import { getEventHandlers, getCalendarTimeFormatting } from './CalendarEventHandlers';
import { useCalendarView } from './CalendarViewConfig';

// Custom styles to ensure addresses wrap properly and CONSISTENT COLUMN WIDTHS
const AddressWrapStyles = () => (
  <style>
    {`
      .event-delivery-address {
        overflow-wrap: break-word;
        word-wrap: break-word;
        hyphens: auto;
        max-height: none !important;
        white-space: normal !important;
      }
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
      }
      .fc-event-time {
        white-space: nowrap;
      }
      .event-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 2px;
      }
      .fc-timegrid-event .fc-event-main {
        padding: 2px 4px !important;
      }
      /* CRITICAL: Force ALL resource columns to be exactly 80px - highest specificity */
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-datagrid-cell-frame,
      .fc-datagrid-cell-cushion,
      .fc-timegrid-col,
      .fc-col-header-cell {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
        box-sizing: border-box !important;
      }
      /* Ensure header area matches content area exactly */
      .fc-datagrid-header .fc-datagrid-cell,
      .fc-datagrid-header .fc-datagrid-cell-frame,
      .fc-datagrid-body .fc-datagrid-cell,
      .fc-datagrid-body .fc-datagrid-cell-frame {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
      }
      /* Special handling for team-6 to ensure consistency */
      [data-resource-id="team-6"] .fc-datagrid-cell,
      [data-resource-id="team-6"].fc-datagrid-cell,
      [data-resource-id="team-6"] .fc-datagrid-cell-frame,
      [data-resource-id="team-6"].fc-datagrid-cell-frame,
      [data-resource-id="team-6"] .fc-timegrid-col,
      [data-resource-id="team-6"].fc-timegrid-col {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
      }
    `}
  </style>
);

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
  droppableScope = 'weekly-calendar'
}) => {
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const { isMobile, getInitialView, getMobileHeaderToolbar, getAspectRatio } = useCalendarView();
  const [currentView, setCurrentView] = useState<string>("resourceTimeGridDay");
  
  // Get the event actions hook
  const { duplicateEvent } = useEventActions(events, () => {}, resources);
  
  // Use the calendar event handlers with the duplicate event function
  const { handleEventClick, DuplicateEventDialog } = useCalendarEventHandlers(
    resources, 
    refreshEvents,
    duplicateEvent
  );

  // Use event operations for handling event changes
  const { handleEventChange, handleEventReceive } = useEventOperations({
    resources,
    refreshEvents
  });

  // Get event handlers
  const { handleEventDrop } = getEventHandlers(handleEventChange, handleEventClick, handleEventReceive);

  // Sort resources in the correct order before passing to FullCalendar
  const sortedResources = [...resources].sort((a, b) => {
    // Special case for "Todays events" (team-6) - it should be last
    if (a.id === 'team-6') return 1;
    if (b.id === 'team-6') return -1;
    
    // Extract team numbers for comparison
    const aMatch = a.id.match(/team-(\d+)/);
    const bMatch = b.id.match(/team-(\d+)/);
    
    if (!aMatch || !bMatch) return 0;
    
    const aNum = parseInt(aMatch[1]);
    const bNum = parseInt(bMatch[1]);
    
    // Sort by team number
    return aNum - bNum;
  });

  // Log events and resources for debugging
  useEffect(() => {
    console.log('ResourceCalendar received events:', events);
    console.log('ResourceCalendar received resources:', resources);
    
    // Force calendar to rerender when events change
    if (calendarRef.current) {
      calendarRef.current.getApi().render();
    }
  }, [events, resources]);

  // Process events to ensure valid resources and add styling
  const processedEvents = processEvents(events, resources);

  // Handler for duplicate button click
  const handleDuplicateButtonClick = (eventId: string) => {
    console.log('Duplicate button clicked for event:', eventId);
    // Find the event in the events array
    const event = events.find(event => event.id === eventId);
    if (event) {
      // Store the selected event for the duplicate dialog
      const dialogEvent = {
        id: event.id,
        title: event.title,
        resourceId: event.resourceId
      };
      
      // Trigger the duplicate dialog via the event handlers
      if (typeof window !== 'undefined') {
        // Set the selected event in the window object for the dialog to use
        // @ts-ignore
        window._selectedEventForDuplicate = dialogEvent;
        
        // Create and dispatch a custom event to trigger the dialog
        const customEvent = new CustomEvent('openDuplicateDialog', { detail: dialogEvent });
        document.dispatchEvent(customEvent);
      }
    }
  };

  // Custom resource header content renderer
  const resourceHeaderContent = (info: any) => {
    if (isMobile) return info.resource.title;
    
    return (
      <ResourceHeaderDropZone 
        resource={info.resource}
        currentDate={currentDate}
        onStaffDrop={onStaffDrop}
        onSelectStaff={onSelectStaff}
        forceRefresh={forceRefresh}
      />
    );
  };

  // Handle team selection
  const handleSelectStaff = (resourceId: string, resourceTitle: string) => {
    console.log('ResourceCalendar.handleSelectStaff called with:', resourceId, resourceTitle);
    if (onSelectStaff) {
      onSelectStaff(resourceId, resourceTitle);
    } else {
      console.error('ResourceCalendar: onSelectStaff prop is not defined');
    }
  };

  // FIXED: Consistent resource column configuration - using NUMBERS for FullCalendar
  const getResourceColumnConfig = () => {
    // Use numeric values for FullCalendar (pixels without 'px')
    const standardWidth = 80;
    
    return {
      resourceAreaWidth: standardWidth,
      slotMinWidth: standardWidth,
      resourceAreaColumns: [
        {
          field: 'title',
          headerContent: 'Teams',
          width: standardWidth
        }
      ],
      resourcesInitiallyExpanded: true,
      stickyResourceAreaHeaders: true,
      resourceLaneWidth: standardWidth,
      resourceWidth: standardWidth
    };
  };

  // Create an object for all calendar props to prevent duplicates
  const fullCalendarProps = {
    ref: calendarRef,
    plugins: [
      resourceTimeGridPlugin,
      timeGridPlugin,
      interactionPlugin,
      dayGridPlugin
    ],
    schedulerLicenseKey: "0134084325-fcs-1745193612",
    initialView: getInitialView(),
    headerToolbar: getMobileHeaderToolbar(),
    views: getCalendarViews(),
    resources: isMobile ? [] : sortedResources,
    events: processedEvents,
    editable: true,
    droppable: true,
    selectable: true,
    eventDurationEditable: true,
    eventResizableFromStart: true,
    eventDrop: handleEventDrop,
    eventResize: handleEventChange,
    eventClick: handleEventClick,
    eventReceive: handleEventReceive,
    datesSet: (dateInfo: any) => {
      setSelectedDate(dateInfo.start);
      onDateSet(dateInfo);
      setCurrentView(dateInfo.view.type);
    },
    initialDate: currentDate,
    height: "auto",
    aspectRatio: getAspectRatio(),
    eventContent: renderEventContent,
    eventDidMount: (info: any) => {
      addEventAttributes(info);
      setupEventActions(info, handleDuplicateButtonClick);
    },
    resourceLabelDidMount: setupResourceHeaderStyles,
    resourceLabelContent: (info: any) => {
      if (isMobile) return info.resource.title;
      
      return (
        <ResourceHeaderDropZone 
          resource={info.resource}
          currentDate={currentDate}
          onStaffDrop={onStaffDrop}
          onSelectStaff={handleSelectStaff}
          forceRefresh={forceRefresh}
        />
      );
    },
    slotLabelDidMount: (info: any) => {
      info.el.style.zIndex = '1';
    },
    dropAccept: ".fc-event",
    eventAllow: () => true,
    // Add the FIXED resource column config with consistent 80px width (as numbers)
    ...getResourceColumnConfig(),
    // Add calendar options
    ...getCalendarOptions(),
    // Add time formatting
    ...getCalendarTimeFormatting(),
    // Apply any additional calendar props (but prioritize our width settings)
    ...calendarProps,
    // OVERRIDE any conflicting width settings from calendarProps with NUMBERS
    resourceAreaWidth: 80,
    slotMinWidth: 80,
    // Update resource rendering to include select button
    resourceAreaHeaderContent: (args: any) => {
      return (
        <div className="flex items-center justify-between p-1">
          <span>Teams</span>
        </div>
      );
    },
    // Enable calendar connection for drag & drop
    eventSourceId: droppableScope,
  };

  return (
    <div className="calendar-container">
      {/* Add custom styles for address wrapping and FIXED column widths */}
      <AddressWrapStyles />
      
      <FullCalendar {...fullCalendarProps} />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
    </div>
  );
};

export default ResourceCalendar;
