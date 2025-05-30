import React, { useEffect, useContext, useCallback } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import DayCalendar from '@/components/Calendar/DayCalendar';
import '../styles/calendar.css';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowDown, RefreshCcw, ArrowLeft } from 'lucide-react';
import { importBookings } from '@/services/importService';
import { useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';

const DayView = () => {
  const {
    events,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    refreshEvents: originalRefreshEvents
  } = useCalendarEvents();

  // Wrap refreshEvents to return Promise<void>
  const refreshEvents = React.useCallback(async (): Promise<void> => {
    await originalRefreshEvents();
  }, [originalRefreshEvents]);

  const [isImporting, setIsImporting] = React.useState(false);
  const navigate = useNavigate();
  const { lastPath } = useContext(CalendarContext);

  useEffect(() => {
    // Log events when they change
    console.log('DayView received events:', events);
    
    if (events.length > 0) {
      toast.success(`${events.length} events loaded`, {
        description: "Calendar data loaded successfully"
      });
    }
  }, [events]);

  // Handle back button click
  const handleBackClick = () => {
    // Navigate back to the last viewed path, or default to weekly view
    const backPath = lastPath || '/weekly-view';
    navigate(backPath);
  };

  // Handle importing bookings
  const handleImportBookings = async () => {
    try {
      setIsImporting(true);
      toast.info('Importing bookings...', {
        description: 'Please wait while we import bookings from the external system'
      });
      
      const result = await importBookings();
      
      if (result.success && result.results) {
        toast.success('Bookings imported successfully', {
          description: `Imported ${result.results.imported} of ${result.results.total} bookings with ${result.results.calendar_events_created} calendar events`
        });
        
        // Refresh calendar to show the newly imported events
        await refreshEvents();
      } else {
        toast.error('Import failed', {
          description: result.error || 'Unknown error occurred during import'
        });
      }
    } catch (error) {
      console.error('Error during import:', error);
      toast.error('Import operation failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleBackClick}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Tillbaka
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Calendar Day View</h1>
              <p className="text-gray-600">Showing all booked events for the selected day</p>
              <p className="text-sm text-blue-600 mt-2">
                Currently viewing: {currentDate.toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex space-x-3">
            <Button 
              onClick={refreshEvents} 
              variant="outline" 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
            <Button 
              onClick={handleImportBookings} 
              disabled={isImporting}
              className="flex items-center gap-2"
            >
              <ArrowDown className="h-4 w-4" />
              {isImporting ? 'Importerar...' : 'Importera bokningar'}
            </Button>
          </div>
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
