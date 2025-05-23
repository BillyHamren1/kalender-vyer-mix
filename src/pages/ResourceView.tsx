
import React, { useEffect, useState } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { moveEventsToTeam } from '@/services/teamService';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceLayout from '@/components/Calendar/ResourceLayout';
import ResourceToolbar from '@/components/Calendar/ResourceToolbar';
import StaffSyncManager from '@/components/Calendar/StaffSyncManager';
import { fetchAllStaffBookings } from '@/services/staffAssignmentService';
import { Button } from '@/components/ui/button';
import { InfoIcon } from 'lucide-react';
import { useStaffOperations } from '@/hooks/useStaffOperations';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';

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
  
  // Get the event actions hook
  const { addEventToCalendar, duplicateEvent } = useEventActions(events, setEvents, resources);
  const isMobile = useIsMobile();
  const [isLoadingAllBookings, setIsLoadingAllBookings] = useState(false);
  
  // Using useState with localStorage to track setup completion
  const [setupDone, setSetupDone] = useState(() => {
    return localStorage.getItem('eventsSetupDone') === 'true';
  });
  
  // Staff selection dialog state
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamTitle, setSelectedTeamTitle] = useState('');
  
  // Use staff operations hook
  const { staffAssignmentsUpdated, handleStaffDrop } = useStaffOperations(currentDate);
  
  // Setup completed flag to prevent multiple setups
  useEffect(() => {
    if (resources.length > 0 && !setupDone && teamResources.some(r => r.id === 'team-6')) {
      // Move all yellow events (event type = "event") to Team 6
      const team6Id = 'team-6';
      const moveYellowEvents = async () => {
        try {
          const movedCount = await moveEventsToTeam('event', team6Id);
          if (movedCount > 0) {
            toast.success(`Moved ${movedCount} events to "Todays events"`, {
              description: "All yellow events have been moved to Team 6"
            });
            // Refresh to show the changes
            refreshEvents();
            
            // Set the flag in localStorage to prevent running this again
            localStorage.setItem('eventsSetupDone', 'true');
            setSetupDone(true);
          }
        } catch (error) {
          console.error('Error moving events:', error);
        }
      };
      
      moveYellowEvents();
    }
  }, [resources, setupDone, teamResources]);

  // Function to open the staff selection dialog
  const handleOpenStaffSelectionDialog = (teamId: string, teamTitle: string) => {
    console.log('ResourceView: Opening staff selection dialog for team:', teamId, teamTitle);
    setSelectedTeamId(teamId);
    setSelectedTeamTitle(teamTitle);
    setStaffDialogOpen(true);
  };
  
  // Function to load all bookings for all staff
  const loadAllBookings = async () => {
    try {
      setIsLoadingAllBookings(true);
      const allBookings = await fetchAllStaffBookings(currentDate);
      
      if (allBookings.length === 0) {
        toast.info('No bookings found for the selected date');
      } else {
        toast.success(`Loaded ${allBookings.length} bookings for all staff`);
        console.log('All bookings:', allBookings);
      }
    } catch (error) {
      console.error('Error loading all bookings:', error);
      toast.error('Failed to load all bookings');
    } finally {
      setIsLoadingAllBookings(false);
    }
  };

  // Handle staff assignment updated callback
  const handleStaffAssigned = () => {
    console.log('Staff assigned, refreshing...');
    // Force refresh of staff assignments
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <StaffSyncManager currentDate={currentDate} />
      
      <ResourceLayout 
        showStaffDisplay={false}
        staffDisplay={<div>Staff Display Placeholder</div>} 
        isMobile={isMobile}>
        {/* ResourceHeader component with team management controls */}
        <ResourceHeader
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />

        {/* Toolbar with Update Button, Add Task Button */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <ResourceToolbar
            isLoading={isLoading}
            currentDate={currentDate}
            resources={resources}
            onRefresh={refreshEvents}
            onAddTask={addEventToCalendar}
          />
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={loadAllBookings}
            disabled={isLoadingAllBookings}
            className="flex items-center gap-2"
          >
            <InfoIcon className="h-4 w-4" />
            {isLoadingAllBookings ? 'Loading all bookings...' : 'Load all bookings'}
          </Button>
        </div>
        
        {/* Calendar */}
        <ResourceCalendar
          events={events}
          resources={resources}
          isLoading={isLoading}
          isMounted={isMounted}
          currentDate={currentDate}
          onDateSet={handleDatesSet}
          refreshEvents={refreshEvents}
          onStaffDrop={handleStaffDrop}
          forceRefresh={staffAssignmentsUpdated}
          onSelectStaff={handleOpenStaffSelectionDialog}
        />
        
        {/* Staff Selection Dialog */}
        <StaffSelectionDialog
          resourceId={selectedTeamId}
          resourceTitle={selectedTeamTitle}
          currentDate={currentDate}
          open={staffDialogOpen}
          onOpenChange={setStaffDialogOpen}
          onStaffAssigned={handleStaffAssigned}
        />
      </ResourceLayout>
    </DndProvider>
  );
};

export default ResourceView;
