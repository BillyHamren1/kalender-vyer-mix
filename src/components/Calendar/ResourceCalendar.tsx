import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { CalendarEvent, Resource, getEventColor } from '../Calendar/ResourceData';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';
import { useNavigate } from 'react-router-dom';
import StaffAssignmentRow from './StaffAssignmentRow';
import WeekTabNavigation from './WeekTabNavigation';
import { addDays, format } from 'date-fns';

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
  const navigate = useNavigate();
  const calendarRef = React.useRef<any>(null);
  const [activeView, setActiveView] = useState<'single' | 'dual'>('single');
  const [selectedDate, setSelectedDate] = useState<Date>(currentDate);

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

  // Update calendar view when active view changes
  useEffect(() => {
    if (!calendarRef.current) return;
    
    if (activeView === 'single') {
      calendarRef.current.getApi().changeView('resourceTimeGridDay');
    } else {
      calendarRef.current.getApi().changeView('resourceTimelineMultiDay');
    }
  }, [activeView]);

  // Handle day change from tabs
  const handleDayChange = (date: Date) => {
    setSelectedDate(date);
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(date);
    }
  };

  // Handle view change (single/dual)
  const handleViewChange = (view: 'single' | 'dual') => {
    setActiveView(view);
  };

  const handleEventChange = async (info: any) => {
    try {
      const resourceId = info.event.getResources()[0]?.id || info.event._def.resourceIds[0];

      if (info.event.id) {
        await updateCalendarEvent(info.event.id, {
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        });
      }

      const resourceName = resources.find(r => r.id === resourceId)?.title || resourceId;

      toast("Event flyttat", {
        description: `Eventet har flyttats till ${resourceName} vid ${info.event.start.toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  const handleEventClick = (info: any) => {
    const bookingId = info.event.extendedProps.bookingId;
    console.log('Event clicked:', info.event);
    console.log('Booking ID:', bookingId);
    
    if (bookingId) {
      navigate(`/booking/${bookingId}`);
      console.log(`Navigating to /booking/${bookingId}`);
    } else {
      console.warn('No booking ID found for this event');
      toast.warning("Cannot open booking details", {
        description: "This event is not linked to a booking"
      });
    }
  };

  // Ensure all events have valid resources
  const eventsWithValidResources = events.map(event => {
    // Check if event's resourceId exists in resources
    const resourceExists = resources.some(r => r.id === event.resourceId);
    
    if (!resourceExists && resources.length > 0) {
      console.warn(`Event with ID ${event.id} has resourceId ${event.resourceId} that doesn't match any resource. Assigning to first available resource.`);
      // Assign to the first resource if the resourceId doesn't exist
      return {
        ...event,
        resourceId: resources[0].id
      };
    }
    
    return event;
  });

  // Process events to add color based on event type
  const processedEvents = eventsWithValidResources.map(event => {
    return {
      ...event,
      backgroundColor: getEventColor(event.eventType),
      borderColor: getEventColor(event.eventType),
      textColor: '#000000e6', // Black text for all events
      classNames: [`event-${event.eventType || 'default'}`],
      extendedProps: {
        ...event,
        dataEventType: event.eventType // Add as data attribute
      }
    };
  });

  // Prepare resources for two-day view by duplicating them with day identifiers
  const prepareResourcesForTwoDayView = () => {
    if (!resources || resources.length === 0) return [];
    
    const day1 = selectedDate;
    const day2 = addDays(selectedDate, 1);
    
    const day1Resources = resources.map(resource => ({
      ...resource,
      id: `day1-${resource.id}`,
      title: resource.title,
      day: format(day1, 'yyyy-MM-dd'),
      displayDay: format(day1, 'MMM dd'),
      group: 'Day 1'
    }));
    
    const day2Resources = resources.map(resource => ({
      ...resource,
      id: `day2-${resource.id}`,
      title: resource.title,
      day: format(day2, 'yyyy-MM-dd'),
      displayDay: format(day2, 'MMM dd'),
      group: 'Day 2'
    }));
    
    return [...day1Resources, ...day2Resources];
  };
  
  // Prepare events for two-day view by assigning to correct day-specific resources
  const prepareEventsForTwoDayView = () => {
    if (!processedEvents || processedEvents.length === 0) return [];
    
    return processedEvents.map(event => {
      const eventDate = new Date(event.start);
      const day1 = selectedDate;
      const day2 = addDays(selectedDate, 1);
      
      // Check which day the event belongs to
      const isSameDay1 = eventDate.getDate() === day1.getDate() && 
                         eventDate.getMonth() === day1.getMonth() && 
                         eventDate.getFullYear() === day1.getFullYear();
                         
      const isSameDay2 = eventDate.getDate() === day2.getDate() && 
                         eventDate.getMonth() === day2.getMonth() && 
                         eventDate.getFullYear() === day2.getFullYear();
      
      if (isSameDay1) {
        return { ...event, resourceId: `day1-${event.resourceId}` };
      } else if (isSameDay2) {
        return { ...event, resourceId: `day2-${event.resourceId}` };
      }
      
      // If not on either day, keep as is (will be filtered out by FullCalendar)
      return event;
    });
  };

  // Get appropriate resources and events based on view
  const getResourcesForActiveView = () => {
    if (activeView === 'dual') {
      return prepareResourcesForTwoDayView();
    }
    return resources;
  };
  
  const getEventsForActiveView = () => {
    if (activeView === 'dual') {
      return prepareEventsForTwoDayView();
    }
    return processedEvents;
  };

  // Custom view configuration
  const customViews = {
    resourceTimeGridDay: {
      type: 'resourceTimeGrid',
      duration: { days: 1 }
    },
    resourceTimelineMultiDay: {
      type: 'resourceTimeline',
      duration: { days: 2 },
      resourceGroupField: 'group',
      resourceAreaWidth: '15%',
      resourcesInitiallyExpanded: true,
      resourceLabelContent: (arg: any) => {
        return {
          html: `<div class="resource-label">
                   <div class="resource-title">${arg.resource.title}</div>
                 </div>`
        };
      }
    },
    timeGridWeek: {
      type: 'timeGrid',
      duration: { weeks: 1 }
    },
    dayGridMonth: {
      type: 'dayGrid',
      duration: { months: 1 }
    }
  };

  return (
    <div className="calendar-container" style={{ height: '600px', overflow: 'auto' }}>
      {/* Week Tab Navigation */}
      <WeekTabNavigation
        currentDate={selectedDate}
        onDayChange={handleDayChange}
        onViewChange={handleViewChange}
        events={events}
        activeView={activeView}
      />
      
      <FullCalendar
        ref={calendarRef}
        plugins={[
          resourceTimeGridPlugin,
          resourceTimelinePlugin,
          timeGridPlugin,
          interactionPlugin,
          dayGridPlugin
        ]}
        schedulerLicenseKey="0134084325-fcs-1745193612"
        initialView={activeView === 'single' ? 'resourceTimeGridDay' : 'resourceTimelineMultiDay'}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'resourceTimeGridDay,timeGridWeek,dayGridMonth'
        }}
        views={customViews}
        resources={getResourcesForActiveView()}
        events={getEventsForActiveView()}
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
        height="550px"
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        scrollTime="07:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00"
        allDaySlot={false}
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
