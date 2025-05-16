
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

  // Handle event drag & drop
  const handleEventDrop = (eventDropInfo: any) => {
    const updatedEvent: any = {
      id: eventDropInfo.event.id,
      title: eventDropInfo.event.title,
      start: eventDropInfo.event.start,
      end: eventDropInfo.event.end,
      resourceId: eventDropInfo.event.extendedProps.resourceId,
      eventType: eventDropInfo.event.extendedProps.eventType
    };
    
    updateEvent(updatedEvent);
  };

  // Handle event resize
  const handleEventResize = (eventResizeInfo: any) => {
    const updatedEvent: any = {
      id: eventResizeInfo.event.id,
      title: eventResizeInfo.event.title,
      start: eventResizeInfo.event.start,
      end: eventResizeInfo.event.end,
      resourceId: eventResizeInfo.event.extendedProps.resourceId,
      eventType: eventResizeInfo.event.extendedProps.eventType
    };
    
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
