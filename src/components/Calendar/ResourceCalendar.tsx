
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const [currentView, setCurrentView] = useState<string>("resourceTimeGridDay");
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>(events);

  // Initialize with props events
  useEffect(() => {
    setLocalEvents(events);
  }, [events]);

  // Subscribe to real-time updates for calendar_events
  useEffect(() => {
    console.log('Setting up real-time subscription for calendar events');
    
    const channel = supabase
      .channel('calendar-updates')
      .on('postgres_changes', 
        { 
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'calendar_events' 
        }, 
        (payload) => {
          console.log('Real-time calendar event update received:', payload);
          
          // Handle different event types
          if (payload.eventType === 'INSERT') {
            const newEvent = transformDatabaseEvent(payload.new);
            console.log('Adding new event to calendar:', newEvent);
            setLocalEvents(prev => [...prev, newEvent]);
            toast.info('New calendar event added');
          } 
          else if (payload.eventType === 'UPDATE') {
            const updatedEvent = transformDatabaseEvent(payload.new);
            console.log('Updating event in calendar:', updatedEvent);
            setLocalEvents(prev => 
              prev.map(event => event.id === updatedEvent.id ? updatedEvent : event)
            );
          } 
          else if (payload.eventType === 'DELETE') {
            console.log('Deleting event from calendar:', payload.old.id);
            setLocalEvents(prev => 
              prev.filter(event => event.id !== payload.old.id)
            );
            toast.info('Calendar event removed');
          }
          
          // Force calendar to rerender
          if (calendarRef.current) {
            calendarRef.current.getApi().render();
          }
        })
      .subscribe();
      
    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Subscribe to real-time updates for bookings
  useEffect(() => {
    console.log('Setting up real-time subscription for bookings');
    
    const channel = supabase
      .channel('booking-updates')
      .on('postgres_changes', 
        { 
          event: 'INSERT', // Only listen for new bookings
          schema: 'public', 
          table: 'bookings' 
        }, 
        (payload) => {
          console.log('New booking received:', payload.new);
          
          // Show toast notification for new booking
          toast.success('New booking received', {
            description: `Booking #${payload.new.id} for ${payload.new.client}`,
            action: {
              label: 'View',
              onClick: () => {
                window.location.href = `/booking/${payload.new.id}`;
              }
            },
            duration: 8000
          });
        })
      .subscribe();
      
    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Transform database event to calendar event format
  const transformDatabaseEvent = (dbEvent: any): CalendarEvent => {
    // Map resource_id to application format (team-X)
    const resourceId = dbEvent.resource_id.startsWith('team-') 
      ? dbEvent.resource_id 
      : `team-${dbEvent.resource_id}`;
    
    const eventType = dbEvent.event_type as 'rig' | 'event' | 'rigDown';
    
    // Get event color based on type
    const getEventColor = (type: 'rig' | 'event' | 'rigDown') => {
      switch(type) {
        case 'rig': return '#F2FCE2';
        case 'event': return '#FEF7CD';
        case 'rigDown': return '#FFDEE2';
        default: return '#E2F5FC';
      }
    };
    
    return {
      id: dbEvent.id,
      resourceId: resourceId,
      title: dbEvent.title,
      start: dbEvent.start_time,
      end: dbEvent.end_time,
      eventType: eventType,
      bookingId: dbEvent.booking_id,
      color: getEventColor(eventType),
      className: dbEvent.booking_id && !dbEvent.viewed ? 'new-booking-event' : ''
    };
  };

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
    if (calendarRef.current) {
      calendarRef.current.getApi().render();
    }
  }, [events, resources]);

  // Process events to ensure valid resources and add styling
  const processedEvents = processEvents(localEvents, resources);

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
          setCurrentView(dateInfo.view.type);
        }}
        initialDate={currentDate}
        {...getCalendarOptions()}
        height="auto"
        aspectRatio={isMobile ? 0.8 : 1.8}
        eventDidMount={(info) => {
          // Add data-event-type attribute to event elements
          if (info.event.extendedProps.eventType) {
            info.el.setAttribute('data-event-type', info.event.extendedProps.eventType);
          }
          
          // Add class for new bookings
          if (info.event.extendedProps.bookingId && !info.event.extendedProps.viewed) {
            info.el.classList.add('new-booking-event');
          }
        }}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: false,
          hour12: false,
          omitZeroMinute: false // Always show minutes even if 00
        }}
      />
    </div>
  );
};

export default ResourceCalendar;
