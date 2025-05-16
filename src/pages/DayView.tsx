
import React from 'react';
import { useDayCalendarEvents } from '@/hooks/useDayCalendarEvents';
import DayCalendar from '@/components/Calendar/DayCalendar';
import '../styles/calendar.css';

const DayView = () => {
  const {
    events,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    updateEvent
  } = useDayCalendarEvents();

  console.log('DayView received events:', events);

  // Handle event drag & drop
  const handleEventDrop = (eventDropInfo: any) => {
    console.log('Event dropped:', eventDropInfo);
    const updatedEvent: any = {
      id: eventDropInfo.event.id,
      title: eventDropInfo.event.title,
      start: eventDropInfo.event.start,
      end: eventDropInfo.event.end,
      resourceId: eventDropInfo.event.extendedProps.resourceId,
      eventType: eventDropInfo.event.extendedProps.eventType || 'event'
    };
    
    console.log('Sending updated event to service:', updatedEvent);
    updateEvent(updatedEvent);
  };

  // Handle event resize
  const handleEventResize = (eventResizeInfo: any) => {
    console.log('Event resized:', eventResizeInfo);
    const updatedEvent: any = {
      id: eventResizeInfo.event.id,
      title: eventResizeInfo.event.title,
      start: eventResizeInfo.event.start,
      end: eventResizeInfo.event.end,
      resourceId: eventResizeInfo.event.extendedProps.resourceId,
      eventType: eventResizeInfo.event.extendedProps.eventType || 'event'
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
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          {events.length === 0 && !isLoading && (
            <div className="text-center py-6 text-gray-500">
              No events found for this day. Events will appear here when scheduled.
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
