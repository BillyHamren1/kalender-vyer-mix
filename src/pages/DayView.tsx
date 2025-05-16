
import React, { useEffect, useState } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import DayCalendar from '@/components/Calendar/DayCalendar';
import '../styles/calendar.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const DayView = () => {
  const {
    events,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    refreshEvents
  } = useCalendarEvents();
  
  const [hasNavigatedToEvent, setHasNavigatedToEvent] = useState(false);

  useEffect(() => {
    // Log events when they change
    console.log('DayView received events:', events);
    
    if (events.length > 0 && !hasNavigatedToEvent) {
      // Find the earliest upcoming event
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const futureEvents = events.filter(event => {
        const eventDate = new Date(event.start);
        return eventDate >= today;
      });
      
      if (futureEvents.length > 0) {
        // Sort events by start date
        const sortedEvents = [...futureEvents].sort((a, b) => 
          new Date(a.start).getTime() - new Date(b.start).getTime()
        );
        
        const earliestEvent = sortedEvents[0];
        const earliestDate = new Date(earliestEvent.start);
        
        console.log('Navigating to earliest event date:', earliestDate);
        sessionStorage.setItem('calendarDate', earliestDate.toISOString());
        
        toast.success(`Navigated to ${format(earliestDate, 'PPP')}`, {
          description: `Found event: ${earliestEvent.title}`
        });
        
        setHasNavigatedToEvent(true);
      } else if (events.length > 0) {
        // If there are no future events but some past events exist
        const sortedEvents = [...events].sort((a, b) => 
          new Date(b.start).getTime() - new Date(a.start).getTime()
        );
        
        const latestEvent = sortedEvents[0];
        const latestDate = new Date(latestEvent.start);
        
        console.log('Navigating to most recent event date:', latestDate);
        sessionStorage.setItem('calendarDate', latestDate.toISOString());
        
        toast.info(`Showing past event from ${format(latestDate, 'PPP')}`, {
          description: `${latestEvent.title}`
        });
        
        setHasNavigatedToEvent(true);
      }
    }
  }, [events, hasNavigatedToEvent]);
  
  const handleRefresh = async () => {
    toast.loading("Refreshing calendar...");
    const updatedEvents = await refreshEvents();
    toast.dismiss();
    
    if (updatedEvents.length > 0) {
      toast.success(`Calendar refreshed with ${updatedEvents.length} events`);
    } else {
      toast.info("No events found in the database", {
        description: "Try adding events first"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Calendar Day View</h1>
            <p className="text-gray-600">Showing all booked events for the selected day</p>
            <p className="text-sm text-blue-600 mt-2">
              Currently viewing: {currentDate.toLocaleDateString()}
            </p>
          </div>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Calendar
          </Button>
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
            refreshEvents={refreshEvents}
          />
        </div>
      </div>
    </div>
  );
};

export default DayView;
