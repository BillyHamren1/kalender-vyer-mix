
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from './ResourceData';
import { useCalendarEventHandlers } from '@/hooks/useCalendarEventHandlers';
import { processEvents } from './CalendarEventProcessor';
import { useEventActions } from '@/hooks/useEventActions';
import { ResourceHeaderDropZone } from './ResourceHeaderDropZone';
import { 
  renderEventContent, 
  setupEventActions, 
  addEventAttributes 
} from './CalendarEventRenderer';
import { getEventHandlers, getCalendarTimeFormatting } from './CalendarEventHandlers';
import './WeeklyCalendarStyles.css';
import { format } from 'date-fns';

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

  // Create nested resources with days as parent resources
  const generateNestedResources = useCallback(() => {
    // Days of the week starting from the current date
    const days = [];
    const startDate = new Date(currentDate);
    
    // Sort resources in the correct order (excluding team-6)
    const sortedResources = [...resources]
      .filter(resource => resource.id !== 'team-6') // Filter out team-6
      .sort((a, b) => {
        const aMatch = a.id.match(/team-(\d+)/);
        const bMatch = b.id.match(/team-(\d+)/);
        
        if (!aMatch || !bMatch) return 0;
        
        const aNum = parseInt(aMatch[1]);
        const bNum = parseInt(bMatch[1]);
        
        return aNum - bNum;
      });
      
    // Add team-6 at the end if it exists
    const team6 = resources.find(resource => resource.id === 'team-6');
    if (team6) {
      sortedResources.push(team6);
    }
    
    // Generate 7 days, each with all teams as children
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + i);
      
      const dayId = `day-${format(day, 'yyyy-MM-dd')}`;
      const dayResource = {
        id: dayId,
        title: format(day, 'EEEE, MMM d'), // e.g., "Monday, May 21"
        children: sortedResources.map(team => ({
          id: `${dayId}_${team.id}`,
          title: team.title,
          originalId: team.id,
          eventColor: team.eventColor,
          parentId: dayId
        }))
      };
      
      days.push(dayResource);
    }
    
    return days;
  }, [currentDate, resources]);
  
  // Memoize the nested resources
  const nestedResources = useMemo(() => generateNestedResources(), [generateNestedResources]);

  // Pre-process events to match our new nested resource structure
  const processedEvents = useMemo(() => {
    // First, process events with the normal processor
    const standardProcessedEvents = processEvents(events, resources);
    
    // Then, remap events to our day_team format
    return standardProcessedEvents.map(event => {
      const eventDate = new Date(event.start);
      const dayId = `day-${format(eventDate, 'yyyy-MM-dd')}`;
      const originalResourceId = event.resourceId;
      
      // Skip events outside our 7-day window
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + 6);
      
      if (eventDate < startDate || eventDate > endDate) {
        return null;
      }
      
      return {
        ...event,
        resourceId: `${dayId}_${originalResourceId}`,
        originalResourceId: originalResourceId
      };
    }).filter(Boolean); // Filter out null events (outside 7-day window)
  }, [events, resources, currentDate]);

  // Handler for duplicate button click
  const handleDuplicateButtonClick = useCallback((eventId: string) => {
    console.log('Duplicate button clicked for event:', eventId);
    const event = events.find(event => event.id === eventId);
    if (event) {
      const dialogEvent = {
        id: event.id,
        title: event.title,
        resourceId: event.resourceId
      };
      
      if (typeof window !== 'undefined') {
        // @ts-ignore
        window._selectedEventForDuplicate = dialogEvent;
        
        const customEvent = new CustomEvent('openDuplicateDialog', { detail: dialogEvent });
        document.dispatchEvent(customEvent);
      }
    }
  }, [events]);

  // Custom resource label content renderer
  const resourceLabelContent = useCallback((info: any) => {
    const resourceInfo = info.resource;
    
    // Check if this is a day header (parent) or team (child)
    const isDay = !resourceInfo.parentId;
    
    if (isDay) {
      // This is a day header
      return (
        <div className="day-resource-header">
          {resourceInfo.title}
        </div>
      );
    } else {
      // This is a team under a day
      // Extract the original team ID from the resource
      const originalTeamId = resourceInfo.extendedProps?.originalId;
      
      if (!originalTeamId) {
        return <div className="team-resource-cell">{resourceInfo.title}</div>;
      }
      
      // For team resources, use the ResourceHeaderDropZone
      return (
        <ResourceHeaderDropZone 
          resource={{
            id: originalTeamId,
            title: resourceInfo.title,
            eventColor: resourceInfo.eventColor
          }}
          currentDate={currentDate}
          onStaffDrop={onStaffDrop}
          forceRefresh={forceRefresh}
        />
      );
    }
  }, [currentDate, onStaffDrop, forceRefresh]);

  // Calculate the duration for the calendar view (from currentDate to currentDate + 6 days)
  const endDate = new Date(currentDate);
  endDate.setDate(currentDate.getDate() + 6);

  return (
    <div className="weekly-calendar-container">
      <style>
        {`
          /* Additional inline styles for specific FullCalendar elements */
          .fc-timeline-slot {
            min-width: 150px !important;
          }
          .fc-timeline-slot-frame {
            min-height: 40px;
          }
          .fc-datagrid-cell-frame {
            overflow: visible !important;
          }
          .resource-header-dropzone {
            min-height: 40px;
          }
        `}
      </style>
      
      <FullCalendar
        ref={calendarRef}
        plugins={[
          resourceTimelinePlugin,
          timeGridPlugin,
          interactionPlugin,
          dayGridPlugin
        ]}
        schedulerLicenseKey="0134084325-fcs-1745193612"
        initialView="resourceTimelineWeek"
        headerToolbar={false} // Disable the default header toolbar
        resources={nestedResources}
        events={processedEvents}
        editable={true}
        droppable={true}
        selectable={true}
        eventDurationEditable={true}
        eventResizableFromStart={true}
        eventDrop={(info) => {
          // When dropping events, we need to map back to the original resource ID
          const resourceElem = info.newResource?._resource;
          const originalResourceId = resourceElem?.extendedProps?.originalId;
          
          if (originalResourceId) {
            // Temporarily modify the event to have the original resource ID for the handler
            const originalEvent = info.event;
            const originalResourceIds = originalEvent._def.resourceIds;
            
            // Hack: temporarily change the resourceIds array
            originalEvent._def.resourceIds = [originalResourceId];
            
            // Call the handler
            handleEventDrop(info);
            
            // Restore the resourceIds
            originalEvent._def.resourceIds = originalResourceIds;
          } else {
            // Fall back to the regular handler if we can't get the original resource ID
            handleEventDrop(info);
          }
        }}
        eventResize={handleEventChange}
        eventClick={handleEventClick}
        datesSet={onDateSet}
        initialDate={currentDate}
        visibleRange={{
          start: currentDate,
          end: endDate
        }}
        slotMinTime="05:00:00"
        slotMaxTime="24:00:00"
        scrollTime="08:00:00"
        height="auto"
        contentHeight="auto"
        aspectRatio={1.8}
        eventContent={renderEventContent}
        eventDidMount={(info) => {
          addEventAttributes(info);
          setupEventActions(info, handleDuplicateButtonClick);
        }}
        {...getCalendarTimeFormatting()}
        resourceLabelContent={resourceLabelContent}
        resourcesInitiallyExpanded={true}
        resourceAreaWidth="200px"
        resourceAreaHeaderContent="Days & Teams"
        slotDuration="01:00:00"
        resourceGroupField="title"
        stickyHeaderDates={true}
        resourceOrder="id"
        eventOrder="start"
      />
      
      {/* Render the duplicate dialog */}
      <DuplicateEventDialog />
    </div>
  );
};

// Use React.memo to prevent unnecessary re-renders
export default React.memo(WeeklyResourceCalendar);
