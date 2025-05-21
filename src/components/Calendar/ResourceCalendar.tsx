
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
import { 
  renderEventContent, 
  setupEventActions, 
  addEventAttributes,
  setupResourceHeaderStyles 
} from './CalendarEventRenderer';
import { getEventHandlers, getCalendarTimeFormatting } from './CalendarEventHandlers';
import { useCalendarView } from './CalendarViewConfig';

// Custom styles to ensure addresses wrap properly in calendar events
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
      /* Force consistent column widths */
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-timegrid-col {
        min-width: 150px !important;
        width: 150px !important;
        max-width: 150px !important;
      }
      /* Special handling for team-6 */
      [data-resource-id="team-6"] .fc-datagrid-cell,
      [data-resource-id="team-6"].fc-datagrid-cell,
      [data-resource-id="team-6"] .fc-timegrid-col,
      [data-resource-id="team-6"].fc-timegrid-col {
        min-width: 150px !important;
        width: 150px !important;
        max-width: 150px !important;
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
  forceRefresh?: boolean;
  calendarProps?: Record<string, any>; // Add this prop to allow passing additional props to FullCalendar
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
  forceRefresh,
  calendarProps = {} // Default to empty object
}) => {
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const { isMobile, getInitialView, getMobileHeaderToolbar, getAspectRatio } = useCalendarView();
  const [currentView, setCurrentView] = useState<string>("resourceTimeGridDay");
  
  // Get the event actions hook
  const { duplicateEvent } = useEventActions(events, () => {}, resources);
  
  // Use the calendar event handlers with the duplicate event function
  const { handleEventChange, handleEventClick, DuplicateEventDialog } = useCalendarEventHandlers(
    resources, 
    refreshEvents,
    duplicateEvent
  );

  // Get event handlers
  const { handleEventDrop } = getEventHandlers(handleEventChange, handleEventClick);

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
        forceRefresh={forceRefresh}
      />
    );
  };

  // Apply consistent column width configuration
  const getResourceColumnConfig = () => {
    // Use provided values from calendarProps or fallback to defaults
    const resourceAreaWidth = calendarProps.resourceAreaWidth || '150px';
    const slotMinWidth = calendarProps.slotMinWidth || '150px';
    
    // Ensure columns for resource headers
    const resourceAreaColumns = calendarProps.resourceAreaColumns || [
      {
        field: 'title',
        headerContent: 'Teams',
        width: '150px' // Ensure fixed width
      }
    ];
    
    return {
      resourceAreaWidth,
      slotMinWidth,
      resourceAreaColumns,
      resourcesInitiallyExpanded: true,
      stickyResourceAreaHeaders: true,
      // Force column widths to be consistent
      resourceLaneWidth: '150px',
      resourceWidth: '150px'
    };
  };

  return (
    <div className="calendar-container">
      {/* Add custom styles for address wrapping and fixed column widths */}
      <AddressWrapStyles />
      
      <FullCalendar
        ref={calendarRef}
        plugins={[
          resourceTimeGridPlugin,
          timeGridPlugin,
          interactionPlugin,
          dayGridPlugin
        ]}
        schedulerLicenseKey="0134084325-fcs-1745193612"
        initialView={getInitialView()}
        headerToolbar={getMobileHeaderToolbar()}
        views={getCalendarViews()}
        resources={isMobile ? [] : sortedResources}
        events={processedEvents}
        editable={true}
        droppable={true}
        selectable={true}
        eventDurationEditable={true}
        eventResizableFromStart={true}
        eventDrop={handleEventDrop}
        eventResize={handleEventChange}
        eventClick={handleEventClick}
        datesSet={(dateInfo) => {
          setSelectedDate(dateInfo.start);
          onDateSet(dateInfo);
          setCurrentView(dateInfo.view.type);
        }}
        initialDate={currentDate}
        {...getCalendarOptions()}
        height="auto"
        aspectRatio={getAspectRatio()}
        eventContent={renderEventContent}
        eventDidMount={(info) => {
          // Add data attributes and setup event-specific elements
          addEventAttributes(info);
          setupEventActions(info, handleDuplicateButtonClick);
        }}
        {...getCalendarTimeFormatting()}
        resourceLabelDidMount={setupResourceHeaderStyles}
        resourceLabelContent={resourceHeaderContent}
        slotLabelDidMount={(info) => {
          // Add z-index to time slots to ensure they appear behind staff badges
          info.el.style.zIndex = '1';
        }}
        // Apply consistent resource column configuration
        {...getResourceColumnConfig()}
        // Apply any additional calendar props
        {...calendarProps}
      />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
    </div>
  );
};

export default ResourceCalendar;
