
import React, { useRef, useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from '../ResourceData';
import { useCalendarEventHandlers } from '@/hooks/useCalendarEventHandlers';
import { processEvents } from '../CalendarEventProcessor';
import { getCalendarViews, getCalendarOptions } from '../CalendarConfig';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEventActions } from '@/hooks/useEventActions';
import { getEventHandlers, getCalendarTimeFormatting } from '../CalendarEventHandlers';
import { useCalendarView } from '../CalendarViewConfig';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { CalendarStylesheet } from './CalendarStylesheet';
import { ResourceHeaderRenderer } from './ResourceHeaderRenderer';
import { EventContentRenderer } from './EventContentRenderer';
import { SortedResources } from './SortedResources';

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
  calendarProps?: Record<string, any>;
}

const ResourceCalendarComponent: React.FC<ResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet,
  refreshEvents,
  onStaffDrop,
  forceRefresh,
  calendarProps = {}
}) => {
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const { isMobile, getInitialView, getMobileHeaderToolbar, getAspectRatio } = useCalendarView();
  const [currentView, setCurrentView] = useState<string>("resourceTimeGridDay");
  
  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{id: string, title?: string, bookingId?: string, eventType?: string} | null>(null);
  
  // Get the event actions hook
  const { duplicateEvent, deleteEvent } = useEventActions(events, () => {}, resources);
  
  // Use the calendar event handlers with the duplicate event function
  const { handleEventChange, handleEventClick, DuplicateEventDialog } = useCalendarEventHandlers(
    resources, 
    refreshEvents,
    duplicateEvent
  );

  // Get event handlers
  const { handleEventDrop } = getEventHandlers(handleEventChange, handleEventClick);

  // Sort resources in the correct order
  const sortedResources = SortedResources(resources);

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
  
  // Handler for delete button click
  const handleDeleteButtonClick = (eventId: string, bookingId: string, eventType: string) => {
    console.log('Delete button clicked for event:', eventId);
    // Find the event in the events array
    const event = events.find(event => event.id === eventId);
    if (event) {
      // Store the event to delete and open the confirmation dialog
      setEventToDelete({
        id: eventId,
        title: event.title,
        bookingId,
        eventType
      });
      setDeleteDialogOpen(true);
    }
  };
  
  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (eventToDelete) {
      try {
        await deleteEvent(eventToDelete.id);
        // Refresh events to update the UI
        await refreshEvents();
      } catch (error) {
        console.error('Error deleting event:', error);
      } finally {
        // Close the dialog
        setDeleteDialogOpen(false);
        setEventToDelete(null);
      }
    }
  };

  // Resource column configuration using custom hook
  const resourceColumnConfig = useResourceColumnConfig(calendarProps);

  return (
    <div className="calendar-container">
      {/* Add custom styles for address wrapping and fixed column widths */}
      <CalendarStylesheet />
      
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
        eventContent={(info) => EventContentRenderer(info, handleDuplicateButtonClick, handleDeleteButtonClick)}
        eventDidMount={(info) => {
          EventContentRenderer.setupEvent(info, handleDuplicateButtonClick, handleDeleteButtonClick);
        }}
        {...getCalendarTimeFormatting()}
        resourceLabelDidMount={(info) => {
          ResourceHeaderRenderer.setupStyles(info);
        }}
        resourceLabelContent={(info) => ResourceHeaderRenderer.renderContent(info, isMobile, currentDate, onStaffDrop, forceRefresh)}
        slotLabelDidMount={(info) => {
          // Add z-index to time slots to ensure they appear behind staff badges
          const slotElement = info.el as HTMLElement;
          slotElement.style.zIndex = '1';
        }}
        // Apply consistent resource column configuration
        {...resourceColumnConfig}
        // Apply any additional calendar props
        {...calendarProps}
      />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog 
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        eventToDelete={eventToDelete}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};

// Extract resource column configuration to a custom hook
function useResourceColumnConfig(calendarProps: Record<string, any>) {
  // Use provided values from calendarProps or fallback to defaults
  const resourceAreaWidth = calendarProps.resourceAreaWidth || '130px'; 
  const slotMinWidth = calendarProps.slotMinWidth || '130px';
  
  // Ensure columns for resource headers
  const resourceAreaColumns = calendarProps.resourceAreaColumns || [
    {
      field: 'title',
      headerContent: 'Teams',
      width: '130px'
    }
  ];
  
  return {
    resourceAreaWidth,
    slotMinWidth,
    resourceAreaColumns,
    resourcesInitiallyExpanded: true,
    stickyResourceAreaHeaders: true,
    // Force column widths to be consistent
    resourceLaneWidth: '130px',
    resourceWidth: '130px'
  };
}

export default ResourceCalendarComponent;
