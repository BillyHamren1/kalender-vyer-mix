
import React, { useEffect } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import '../styles/calendar.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
// react-dnd is imported by StaffAssignmentRow component

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
  
  // Automatically navigate to date of first event if it exists
  useEffect(() => {
    if (events.length > 0 && !isLoading && isMounted) {
      // Find the earliest event from today or future
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
        
        // If there's a calendar reference, navigate to the date
        if (earliestDate) {
          // We'll use sessionStorage to pass the date to the calendar
          sessionStorage.setItem('calendarDate', earliestDate.toISOString());
          
          // Wait a bit for the calendar to initialize then trigger a refresh
          setTimeout(() => {
            refreshEvents();
          }, 500);
        }
      }
    }
  }, [events, isLoading, isMounted]);
  
  const handleRefresh = async () => {
    toast.loading("Refreshing calendar...");
    await refreshEvents();
    toast.dismiss();
    toast.success("Calendar refreshed");
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`container mx-auto pt-2 ${isMobile ? 'px-2' : ''}`} style={{ maxWidth: isMobile ? '100%' : '94%' }}>
        <div className="flex justify-between items-center mb-4">
          <ResourceHeader 
            teamResources={teamResources}
            teamCount={teamCount}
            onAddTeam={addTeam}
            onRemoveTeam={removeTeam}
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
          />
          
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
        
        <div className={`bg-white rounded-lg shadow-md ${isMobile ? 'p-2' : 'p-3'}`}>
          {events.length === 0 && !isLoading && (
            <div className="text-center py-4 text-gray-500 mb-4">
              No events found. Events will appear here when scheduled.
            </div>
          )}
          
          <ResourceCalendar
            events={events}
            resources={resources}
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

export default ResourceView;
