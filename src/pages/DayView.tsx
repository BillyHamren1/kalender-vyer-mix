
import React, { useEffect } from 'react';
import { useDayCalendarEvents } from '@/hooks/useDayCalendarEvents';
import DayCalendar from '@/components/Calendar/DayCalendar';
import '../styles/calendar.css';
import { toast } from 'sonner';

const DayView = () => {
  const {
    events,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    updateEvent
  } = useDayCalendarEvents();

  useEffect(() => {
    // Log events when they change
    console.log('DayView received events:', events);
    
    if (events.length > 0) {
      toast.success(`${events.length} events loaded`, {
        description: "Calendar data loaded successfully"
      });
    }
  }, [events]);

  // Enhanced event handlers with better resource ID handling and logging
  const handleEventDrop = (eventDropInfo: any) => {
    console.log('Event dropped:', eventDropInfo);
    
    // Access the resource ID directly or from resourceIds array
    let resourceId = null;
    
    if (eventDropInfo.event.getResources && eventDropInfo.event.getResources().length > 0) {
      resourceId = eventDropInfo.event.getResources()[0].id;
    } else if (eventDropInfo.event._def && eventDropInfo.event._def.resourceIds) {
      resourceId = eventDropInfo.event._def.resourceIds[0];
    } else if (eventDropInfo.event.extendedProps && eventDropInfo.event.extendedProps.resourceId) {
      resourceId = eventDropInfo.event.extendedProps.resourceId;
    }
    
    // If we still don't have a resource ID, use a default
    if (!resourceId) {
      console.warn('No resource ID found in event, using default');
      resourceId = 'team-1';
    }
    
    const updatedEvent: any = {
      id: eventDropInfo.event.id,
      title: eventDropInfo.event.title,
      start: eventDropInfo.event.start,
      end: eventDropInfo.event.end,
      resourceId: resourceId,
      eventType: eventDropInfo.event.extendedProps?.eventType || 'event'
    };
    
    console.log('Sending updated event to service:', updatedEvent);
    updateEvent(updatedEvent);
  };

  // Similar updates for event resize
  const handleEventResize = (eventResizeInfo: any) => {
    console.log('Event resized:', eventResizeInfo);
    
    // Access the resource ID directly or from resourceIds array
    let resourceId = null;
    
    if (eventResizeInfo.event.getResources && eventResizeInfo.event.getResources().length > 0) {
      resourceId = eventResizeInfo.event.getResources()[0].id;
    } else if (eventResizeInfo.event._def && eventResizeInfo.event._def.resourceIds) {
      resourceId = eventResizeInfo.event._def.resourceIds[0];
    } else if (eventResizeInfo.event.extendedProps && eventResizeInfo.event.extendedProps.resourceId) {
      resourceId = eventResizeInfo.event.extendedProps.resourceId;
    }
    
    // If we still don't have a resource ID, use a default
    if (!resourceId) {
      console.warn('No resource ID found in event, using default');
      resourceId = 'team-1';
    }
    
    const updatedEvent: any = {
      id: eventResizeInfo.event.id,
      title: eventResizeInfo.event.title,
      start: eventResizeInfo.event.start,
      end: eventResizeInfo.event.end,
      resourceId: resourceId,
      eventType: eventResizeInfo.event.extendedProps?.eventType || 'event'
    };
    
    console.log('Sending updated event to service:', updatedEvent);
    updateEvent(updatedEvent);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Calendar Day View</h1>
          <p className="text-gray-600">Showing all booked events for the selected day</p>
          <p className="text-sm text-blue-600 mt-2">
            Currently viewing: {currentDate.toLocaleDateString()}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          {events.length === 0 && !isLoading && (
            <div className="text-center py-6 text-gray-500">
              No events found for this day. Events will appear here when scheduled.
              <p className="mt-2 text-sm text-blue-500">Try using the "Find Events" button to navigate to dates with events.</p>
            </div>
          )}
          
          <DayCalendar
            events={events}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentDate}
            onDateSet={handleDatesSet}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
          />
        </div>
      </div>
    </div>
  );
};

export default DayView;
