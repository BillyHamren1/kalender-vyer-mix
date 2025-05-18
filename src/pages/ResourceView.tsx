
import React, { useEffect } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import StaffAssignmentRow from '@/components/Calendar/StaffAssignmentRow';
import DayNavigation from '@/components/Calendar/DayNavigation';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import '../styles/calendar.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ArrowDown, RefreshCcw } from 'lucide-react';
import { importBookings } from '@/services/importService';
import { toast } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const ResourceView = () => {
  // Use our custom hooks to manage state and logic
  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    refreshEvents
  } = useCalendarEvents();
  
  const {
    resources,
    teamResources,
    teamCount,
    dialogOpen,
    setDialogOpen,
    addTeam,
    removeTeam
  } = useTeamResources();
  
  const { addEventToCalendar } = useEventActions(events, setEvents, resources);
  const isMobile = useIsMobile();
  const [isImporting, setIsImporting] = React.useState(false);
  
  // Fetch events when this view is mounted
  useEffect(() => {
    refreshEvents();
  }, []);
  
  // Determine if we should show the Staff Assignment Row - only show on desktop in day view
  const shouldShowStaffAssignmentRow = () => {
    return !isMobile;
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

  // Handle staff drop for assignment
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    try {
      if (resourceId) {
        toast.info(`Assigning staff ${staffId} to team ${resourceId}...`);
      } else {
        toast.info(`Removing staff ${staffId} assignment...`);
      }

      // Assuming we're using the StaffAssignmentRow's existing handler
      // This will be passed to both components so they can share functionality
      return Promise.resolve();
    } catch (error) {
      console.error('Error handling staff drop:', error);
      toast.error('Failed to update staff assignment');
      return Promise.reject(error);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50">
        <div className={`container mx-auto pt-2 ${isMobile ? 'px-2' : ''}`} style={{ maxWidth: isMobile ? '100%' : '94%' }}>
          <div className={`bg-white rounded-lg shadow-md mb-4 ${isMobile ? 'p-2' : 'p-3'}`}>
            {/* Day Navigation Bar - displayed above the calendar */}
            <div className="flex justify-between items-center mb-4">
              <DayNavigation currentDate={currentDate} />
              <div className="flex space-x-2">
                <Button 
                  onClick={refreshEvents} 
                  variant="outline" 
                  size="sm"
                  disabled={isLoading}
                  className="flex items-center gap-1"
                >
                  <RefreshCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                  {isMobile ? '' : 'Uppdatera'}
                </Button>
                <Button 
                  onClick={handleImportBookings} 
                  size="sm"
                  disabled={isImporting}
                  className="flex items-center gap-1"
                >
                  <ArrowDown className="h-3 w-3" />
                  {isMobile ? '' : (isImporting ? 'Importerar...' : 'Importera')}
                </Button>
              </div>
            </div>
            
            <ResourceCalendar
              events={events}
              resources={resources}
              isLoading={isLoading}
              isMounted={isMounted}
              currentDate={currentDate}
              onDateSet={handleDatesSet}
              refreshEvents={refreshEvents}
            />
          </div>
          
          {/* Available Staff Display */}
          {shouldShowStaffAssignmentRow() && (
            <div className="mt-4">
              <AvailableStaffDisplay 
                currentDate={currentDate} 
                onStaffDrop={handleStaffDrop}
              />
            </div>
          )}
          
          {/* Staff Assignment Row with current date */}
          {shouldShowStaffAssignmentRow() && (
            <div className="mt-4">
              <StaffAssignmentRow 
                resources={resources} 
                currentDate={currentDate} 
              />
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
};

export default ResourceView;
