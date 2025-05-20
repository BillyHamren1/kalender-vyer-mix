
import React, { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from '../Calendar/ResourceData';
import { useCalendarEventHandlers } from '@/hooks/useCalendarEventHandlers';
import { processEvents } from './CalendarEventProcessor';
import { getCalendarViews, getCalendarOptions, getHeaderToolbar } from './CalendarConfig';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEventActions } from '@/hooks/useEventActions';
import { ResourceHeaderDropZone } from './ResourceHeaderDropZone';
import { useDrop } from 'react-dnd';
import { StaffMember } from './StaffTypes';
import { Copy } from 'lucide-react';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean; // Add this prop to force refresh
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
  forceRefresh
}) => {
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const isMobile = useIsMobile();
  const [currentView, setCurrentView] = useState<string>("resourceTimeGridDay");
  
  // Get the event actions hook
  const { duplicateEvent } = useEventActions(events, () => {}, resources);
  
  // Use the calendar event handlers with the duplicate event function
  const { handleEventChange, handleEventClick, DuplicateEventDialog } = useCalendarEventHandlers(
    resources, 
    refreshEvents,
    duplicateEvent
  );

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
    console.log('ResourceCalendar sorted resources:', sortedResources);
    
    // Check if there are events with resource IDs that don't match any resources
    const resourceIds = new Set(resources.map(r => r.id));
    const unmatchedEvents = events.filter(event => !resourceIds.has(event.resourceId));
    
    if (unmatchedEvents.length > 0) {
      console.warn('Events with unmatched resources:', unmatchedEvents);
    }
    
    // Log event types for debugging
    const eventTypes = events.map(e => e.eventType);
    console.log('Event types in ResourceCalendar:', eventTypes);
    
    // Force calendar to rerender when events change
    if (calendarRef.current) {
      calendarRef.current.getApi().render();
    }
  }, [events, resources]);

  // Process events to ensure valid resources and add styling
  const processedEvents = processEvents(events, resources);

  // Log processed events for debugging
  useEffect(() => {
    console.log('Processed events for calendar:', processedEvents);
  }, [processedEvents]);

  // Get appropriate initial view based on screen size
  const getInitialView = () => {
    return isMobile ? "timeGridDay" : "resourceTimeGridDay";
  };

  // Get appropriate header toolbar based on screen size
  const getMobileHeaderToolbar = () => {
    if (isMobile) {
      return {
        left: 'prev,next',
        center: 'title',
        right: 'timeGridDay,dayGridMonth'
      };
    }
    return getHeaderToolbar();
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

  // Custom event content renderer to handle stacked events differently
  const renderEventContent = (eventInfo: any) => {
    const isTeam6Event = eventInfo.event.getResources()[0]?.id === 'team-6';
    const isModifiedDisplay = eventInfo.event.extendedProps?.isModifiedDisplay;
    
    // If it's a team-6 event with modified display, format it specially with three lines
    if (isTeam6Event && isModifiedDisplay) {
      const clientName = eventInfo.event.title;
      const bookingId = eventInfo.event.extendedProps?.bookingId || 'No ID';
      const deliveryAddress = eventInfo.event.extendedProps?.deliveryAddress || 'No address';
      
      return (
        <div className="stacked-event-content">
          <div className="event-client-name">{clientName}</div>
          <div className="event-booking-id">ID: {bookingId}</div>
          <div className="event-delivery-address">{deliveryAddress}</div>
        </div>
      );
    }
    
    // Default rendering for regular events
    return (
      <div>
        <div className="fc-event-time">{eventInfo.timeText}</div>
        <div className="fc-event-title">{eventInfo.event.title}</div>
      </div>
    );
  };

  // Custom handler for event drops that prevents changes to team-6 events
  const handleEventDrop = (info: any) => {
    const isTeam6Event = info.event.getResources()[0]?.id === 'team-6';
    
    // If it's a team-6 event, revert the drop operation
    if (isTeam6Event) {
      info.revert();
      return;
    }
    
    // Otherwise, let the regular handler process it
    handleEventChange(info);
  };

  return (
    <div className="calendar-container">
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
        aspectRatio={isMobile ? 0.8 : 1.8}
        eventContent={renderEventContent}
        eventDidMount={(info) => {
          // Add data-event-type attribute to event elements
          if (info.event.extendedProps.eventType) {
            info.el.setAttribute('data-event-type', info.event.extendedProps.eventType);
          }
          
          // Identify team-6 events for special handling
          const isTeam6Event = info.event.getResources()[0]?.id === 'team-6';
          if (isTeam6Event) {
            info.el.setAttribute('data-team6-event', 'true');
          }
          
          // Add duplicate button to event (only for non-team-6 events)
          if (!isTeam6Event) {
            const eventEl = info.el;
            const eventId = info.event.id;
            
            // Create a container for the duplicate button
            const actionContainer = document.createElement('div');
            actionContainer.className = 'event-actions';
            actionContainer.style.position = 'absolute';
            actionContainer.style.top = '2px';
            actionContainer.style.right = '2px';
            actionContainer.style.display = 'none'; // Hidden by default, shown on hover
            actionContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            actionContainer.style.borderRadius = '4px';
            actionContainer.style.padding = '2px';
            actionContainer.style.zIndex = '10';
            
            // Create the duplicate button with icon
            const duplicateButton = document.createElement('button');
            duplicateButton.className = 'duplicate-event-btn';
            duplicateButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" ry="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
            duplicateButton.title = 'Duplicate this event';
            duplicateButton.style.cursor = 'pointer';
            duplicateButton.style.border = 'none';
            duplicateButton.style.background = 'transparent';
            duplicateButton.style.display = 'flex';
            duplicateButton.style.alignItems = 'center';
            duplicateButton.style.justifyContent = 'center';
            
            // Add duplicate button to the container
            actionContainer.appendChild(duplicateButton);
            
            // Add container to the event element
            eventEl.appendChild(actionContainer);
            
            // Add event listeners
            duplicateButton.addEventListener('click', (e) => {
              e.stopPropagation(); // Prevent event click handler from being triggered
              handleDuplicateButtonClick(eventId);
            });
            
            // Show actions on hover (for desktop)
            eventEl.addEventListener('mouseenter', () => {
              actionContainer.style.display = 'block';
            });
            
            eventEl.addEventListener('mouseleave', () => {
              actionContainer.style.display = 'none';
            });
            
            // For mobile, show on touch start and hide after a delay
            eventEl.addEventListener('touchstart', () => {
              actionContainer.style.display = 'block';
              // Hide after 5 seconds to prevent it from staying visible forever
              setTimeout(() => {
                actionContainer.style.display = 'none';
              }, 5000);
            });
          }
        }}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
          hour12: false,
          omitZeroMinute: false // Always show minutes even if 00
        }}
        resourceLabelDidMount={(info) => {
          // Ensure proper rendering of resource headers
          const headerEl = info.el.querySelector('.fc-datagrid-cell-main');
          if (headerEl) {
            // Set the height and make it overflow visible
            const headerHTMLElement = headerEl as HTMLElement;
            headerHTMLElement.style.height = '100%';
            headerHTMLElement.style.width = '100%';
            headerHTMLElement.style.overflow = 'visible';
            headerHTMLElement.style.position = 'relative';
            headerHTMLElement.style.zIndex = '20'; // Increased z-index to ensure visibility
            
            // Also fix the parent elements
            const cellFrame = info.el.querySelector('.fc-datagrid-cell-frame');
            if (cellFrame) {
              const cellFrameElement = cellFrame as HTMLElement;
              cellFrameElement.style.overflow = 'visible';
              cellFrameElement.style.position = 'relative';
              cellFrameElement.style.minHeight = '100px'; // Ensure enough space for staff badges
            }
          }
        }}
        resourceLabelContent={resourceHeaderContent}
        slotLabelDidMount={(info) => {
          // Add z-index to time slots to ensure they appear behind staff badges
          info.el.style.zIndex = '1';
        }}
      />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
    </div>
  );
};

export default ResourceCalendar;
