
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
  
  // Ensure events duplication prevention is always active
  useEffect(() => {
    // This prevents any automatic event duplication by always setting the flag to true
    localStorage.setItem('eventsSetupDone', 'true');
    
    // Clean up any potential duplicate events
    const cleanupDuplicateEvents = async () => {
      try {
        // Force a refresh to get the latest events and remove duplicates
        await refreshEvents();
      } catch (error) {
        console.error('Error cleaning up duplicate events:', error);
      }
    };
    
    cleanupDuplicateEvents();
  }, [refreshEvents]);

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
          className="w-full"
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
