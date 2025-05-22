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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
        color: #000000e6 !important;
      }
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
        color: #000000e6 !important;
      }
      .fc-event-time {
        white-space: nowrap;
        color: #000000e6 !important;
      }
      .event-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 2px;
        color: #000000e6 !important;
      }
      .fc-timegrid-event .fc-event-main {
        padding: 2px 4px !important;
        color: #000000e6 !important;
      }
      /* Force consistent column widths - REDUCED */
      .fc-resource-area td,
      .fc-resource-area th,
      .fc-resource-lane,
      .fc-datagrid-cell,
      .fc-timegrid-col {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
      }
      /* Special handling for team-6 - REDUCED */
      [data-resource-id="team-6"] .fc-datagrid-cell,
      [data-resource-id="team-6"].fc-datagrid-cell,
      [data-resource-id="team-6"] .fc-timegrid-col,
      [data-resource-id="team-6"].fc-timegrid-col {
        min-width: 80px !important;
        width: 80px !important;
        max-width: 80px !important;
      }
      /* Ensure all event text is black */
      .fc-event *, 
      .fc-timegrid-event *, 
      .fc-daygrid-event *,
      .event-client-name,
      .event-street,
      .event-city,
      .event-booking-id {
        color: #000000e6 !important;
      }
      /* Style for potential duplicate events - REMOVING RED LEFT BORDER */
      .fc-event[data-has-booking-id="true"] {
        /* Removing the red left border */
        border-left: none !important;
      }
      /* Hide action buttons by default, show on hover */
      .event-actions {
        display: none;
      }
      .fc-event:hover .event-actions {
        display: flex;
      }
      /* Style for delete button */
      .delete-event-btn:hover {
        color: #e11d48;
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
    const resourceAreaWidth = calendarProps.resourceAreaWidth || '120px';  // Increased from 80px
    const slotMinWidth = calendarProps.slotMinWidth || '120px';            // Increased from 80px
    
    // Ensure columns for resource headers
    const resourceAreaColumns = calendarProps.resourceAreaColumns || [
      {
        field: 'title',
        headerContent: 'Teams',
        width: '120px' // Increased from 80px
      }
    ];
    
    return {
      resourceAreaWidth,
      slotMinWidth,
      resourceAreaColumns,
      resourcesInitiallyExpanded: true,
      stickyResourceAreaHeaders: true,
      // Force column widths to be consistent
      resourceLaneWidth: '120px',  // Increased from 80px
      resourceWidth: '120px'       // Increased from 80px
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
          setupEventActions(info, handleDuplicateButtonClick, handleDeleteButtonClick);
          
          // Make sure all events are draggable, including team-6 events
          // Remove any cursor restrictions
          info.el.style.cursor = 'move';
          info.el.style.pointerEvents = 'auto';
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
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Event Deletion</DialogTitle>
            <DialogDescription>
              {eventToDelete?.bookingId ? (
                <>
                  Are you sure you want to delete this {eventToDelete.eventType} event for booking {eventToDelete.bookingId}?
                  {eventToDelete.eventType === 'event' && (
                    <p className="text-destructive mt-2 font-medium">
                      This will remove the event from the calendar but will not affect the booking itself.
                    </p>
                  )}
                </>
              ) : (
                <>Are you sure you want to delete this event?</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResourceCalendar;
