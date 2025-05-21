
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
import './WeeklyCalendarStyles.css';

interface WeeklyResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
  refreshEvents: () => Promise<void | CalendarEvent[]>;
  onStaffDrop?: (staffId: string, resourceId: string | null) => Promise<void>;
  forceRefresh?: boolean;
}

const WeeklyResourceCalendar: React.FC<WeeklyResourceCalendarProps> = ({
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
        // @ts-ignore
        window._selectedEventForDuplicate = dialogEvent;
        
        // Create and dispatch a custom event to trigger the dialog
        const customEvent = new CustomEvent('openDuplicateDialog', { detail: dialogEvent });
        document.dispatchEvent(customEvent);
      }
    }
  };

  // Custom resource header content renderer with memoization
  const resourceHeaderContent = React.useCallback((info: any) => {
    return (
      <ResourceHeaderDropZone 
        resource={info.resource}
        currentDate={currentDate}
        onStaffDrop={onStaffDrop}
        forceRefresh={forceRefresh}
      />
    );
  }, [currentDate, onStaffDrop, forceRefresh]);

  // Calculate the duration for the calendar view (from currentDate to currentDate + 6 days)
  const endDate = new Date(currentDate);
  endDate.setDate(currentDate.getDate() + 6);

  return (
    <div className="weekly-calendar-container">
      <style>
        {`
          .fc-scrollgrid-sync-inner {
            min-width: 150px;
          }
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
          .weekly-calendar-container .fc-view {
            width: 200%;
            min-width: 1200px;
          }
          .weekly-calendar-container .fc-view-harness {
            overflow-x: visible;
            min-height: 600px;
          }
        `}
      </style>
      
      <FullCalendar
        ref={calendarRef}
        plugins={[
          resourceTimeGridPlugin,
          timeGridPlugin,
          interactionPlugin,
          dayGridPlugin
        ]}
        schedulerLicenseKey="0134084325-fcs-1745193612"
        initialView="resourceTimeGridWeek"
        headerToolbar={false} // Disable the default header toolbar
        resources={sortedResources}
        events={processedEvents}
        editable={true}
        droppable={true}
        selectable={true}
        eventDurationEditable={true}
        eventResizableFromStart={true}
        eventDrop={handleEventDrop}
        eventResize={handleEventChange}
        eventClick={handleEventClick}
        datesSet={onDateSet}
        initialDate={currentDate}
        visibleRange={{
          start: currentDate,
          end: endDate
        }}
        {...getCalendarOptions()}
        height="auto"
        contentHeight="auto"
        aspectRatio={1.8}
        eventContent={renderEventContent}
        eventDidMount={(info) => {
          addEventAttributes(info);
          setupEventActions(info, handleDuplicateButtonClick);
        }}
        {...getCalendarTimeFormatting()}
        resourceLabelDidMount={setupResourceHeaderStyles}
        resourceLabelContent={resourceHeaderContent}
        slotLabelDidMount={(info) => {
          info.el.style.zIndex = '1';
        }}
        views={{
          resourceTimeGridWeek: {
            type: 'resourceTimeGrid',
            duration: { days: 7 },
            scrollTime: '08:00:00',
            slotMinTime: '05:00:00',
            slotMaxTime: '24:00:00'
          }
        }}
      />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
    </div>
  );
};

// Use React.memo to prevent unnecessary re-renders
export default React.memo(WeeklyResourceCalendar);
