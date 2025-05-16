
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

  return (
    <div className="calendar-container" style={{ height: '600px', overflow: 'auto' }}>
      {/* Week Tab Navigation */}
      <WeekTabNavigation
        currentDate={selectedDate}
        onDayChange={handleDayChange}
        events={events}
      />
      
      <FullCalendar
        ref={calendarRef}
        plugins={[
          resourceTimeGridPlugin,
          timeGridPlugin,
          interactionPlugin,
          dayGridPlugin
        ]}
        schedulerLicenseKey="0134084325-fcs-1745193612"
        initialView="resourceTimeGridDay"
        headerToolbar={getHeaderToolbar()}
        views={getCalendarViews()}
        resources={resources}
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
        eventDidMount={(info) => {
          // Add data-event-type attribute to event elements
          if (info.event.extendedProps.eventType) {
            info.el.setAttribute('data-event-type', info.event.extendedProps.eventType);
          }
        }}
      />
      
      {/* Staff Assignment Row component */}
      <StaffAssignmentRow resources={resources} />
    </div>
  );
};

export default ResourceCalendar;
