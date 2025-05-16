
import React, { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource } from '../Calendar/ResourceData';
import StaffAssignmentRow from './StaffAssignmentRow';
import WeekTabNavigation from './WeekTabNavigation';
import { useCalendarEventHandlers } from '@/hooks/useCalendarEventHandlers';
import { processEvents } from './CalendarEventProcessor';
import { getCalendarViews, getCalendarOptions, getHeaderToolbar } from './CalendarConfig';
import { useIsMobile } from '@/hooks/use-mobile';

interface ResourceCalendarProps {
  events: CalendarEvent[];
  resources: Resource[];
  isLoading: boolean;
  isMounted: boolean;
  currentDate: Date;
  onDateSet: (dateInfo: any) => void;
}

const ResourceCalendar: React.FC<ResourceCalendarProps> = ({
  events,
  resources,
  isLoading,
  isMounted,
  currentDate,
  onDateSet
}) => {
  const calendarRef = useRef<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);
  const { handleEventChange, handleEventClick } = useCalendarEventHandlers(resources);
  const isMobile = useIsMobile();

  // Log events and resources for debugging
  useEffect(() => {
    console.log('ResourceCalendar received events:', events);
    console.log('ResourceCalendar received resources:', resources);
    
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
    if (calendarRef.current && events.length > 0) {
      console.log('Forcing calendar rerender due to new events');
      calendarRef.current.getApi().refetchEvents();
      calendarRef.current.getApi().render();
    }
  }, [events, resources]);

  // Handle day change from tabs
  const handleDayChange = (date: Date) => {
    setSelectedDate(date);
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(date);
    }
  };

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

  if (isLoading) {
    return <div className="p-4 text-center">Loading calendar...</div>;
  }

  return (
    <div className="calendar-container" style={{ height: isMobile ? 'auto' : '600px', overflow: 'auto' }}>
      {/* Week Tab Navigation - Only show on desktop */}
      {!isMobile && (
        <WeekTabNavigation
          currentDate={selectedDate}
          onDayChange={handleDayChange}
          events={events}
        />
      )}
      
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
        resources={isMobile ? [] : resources}
        events={processedEvents}
        editable={true}
        droppable={true}
        selectable={true}
        eventDurationEditable={true}
        eventResizableFromStart={true}
        eventDrop={handleEventChange}
        eventResize={handleEventChange}
        eventClick={handleEventClick}
        datesSet={(dateInfo) => {
          setSelectedDate(dateInfo.start);
          onDateSet(dateInfo);
        }}
        initialDate={currentDate}
        {...getCalendarOptions()}
        height={isMobile ? 'auto' : undefined}
        contentHeight={isMobile ? 'auto' : undefined}
        aspectRatio={isMobile ? 0.8 : 1.8}
        eventDidMount={(info) => {
          // Add data-event-type attribute to event elements
          if (info.event.extendedProps.eventType) {
            info.el.setAttribute('data-event-type', info.event.extendedProps.eventType);
          }
          console.log('Event mounted:', info.event.title, info.event.start, info.event.end);
        }}
      />
      
      {/* Staff Assignment Row component - Only show on desktop */}
      {!isMobile && <StaffAssignmentRow resources={resources} />}
    </div>
  );
};

export default ResourceCalendar;
