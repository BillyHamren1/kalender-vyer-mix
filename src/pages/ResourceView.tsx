
import React, { useEffect, useState } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceLayout from '@/components/Calendar/ResourceLayout';
import ResourceToolbar from '@/components/Calendar/ResourceToolbar';
import StaffSyncManager from '@/components/Calendar/StaffSyncManager';

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
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);
  
  // Using useState with localStorage to track setup completion
  const [setupDone, setSetupDone] = useState(() => {
    return localStorage.getItem('eventsSetupDone') === 'true';
  });
  
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

  // Handle staff drop for assignment
  const handleStaffDrop = async (staffId: string, resourceId: string | null) => {
    try {
      console.log(`Handling staff drop: staff=${staffId}, resource=${resourceId}`);
      if (resourceId) {
        toast.info(`Assigning staff ${staffId} to team ${resourceId}...`);
        try {
          await assignStaffToTeam(staffId, resourceId, currentDate);
          toast.success('Staff assigned to team successfully');
        } catch (error) {
          console.error('Error assigning staff to team:', error);
          toast.error('Failed to assign staff to team. Please try again.');
          return Promise.reject(error);
        }
      } else {
        toast.info(`Removing staff ${staffId} assignment...`);
        try {
          await removeStaffAssignment(staffId, currentDate);
          toast.success('Staff assignment removed successfully');
        } catch (error) {
          console.error('Error removing staff assignment:', error);
          toast.error('Failed to remove staff assignment. Please try again.');
          return Promise.reject(error);
        }
      }
      
      // Trigger a refresh of the staff assignments
      setStaffAssignmentsUpdated(prev => !prev);
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error handling staff drop:', error);
      toast.error('Failed to update staff assignment');
      return Promise.reject(error);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <StaffSyncManager currentDate={currentDate} />
      
      <ResourceLayout 
        staffDisplay={
          <AvailableStaffDisplay 
            currentDate={currentDate} 
            onStaffDrop={handleStaffDrop}
          />
        }
        showStaffDisplay={true}
        isMobile={isMobile}
      >
        {/* ResourceHeader component with team management controls */}
        <ResourceHeader
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />

        {/* Toolbar with Update Button, Add Task Button, and Navigation */}
        <ResourceToolbar
          isLoading={isLoading}
          currentDate={currentDate}
          resources={resources}
          onRefresh={refreshEvents}
          onAddTask={addEventToCalendar}
        />
        
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
        />
      </ResourceLayout>
    </DndProvider>
  );
};

export default ResourceView;
