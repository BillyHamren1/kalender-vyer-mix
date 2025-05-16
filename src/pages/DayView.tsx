
import React, { useEffect } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import DayCalendar from '@/components/Calendar/DayCalendar';
import '../styles/calendar.css';
import { toast } from 'sonner';

const DayView = () => {
  const {
    events,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet
  } = useCalendarEvents();

  useEffect(() => {
    // Log events when they change
    console.log('DayView received events:', events);
    
    if (events.length > 0) {
      toast.success(`${events.length} events loaded`, {
        description: "Calendar data loaded successfully"
      });
    }
  }, [events]);

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
            </div>
          )}
          
          <DayCalendar
            events={events}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentDate}
            onDateSet={handleDatesSet}
          />
        </div>
      </div>
    </div>
  );
};

export default DayView;
