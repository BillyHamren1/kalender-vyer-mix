
import React, { useEffect, useState } from 'react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
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
import DateNavigationHeader from '@/components/Calendar/DateNavigationHeader';
import { useStaffOperations } from '@/hooks/useStaffOperations';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';
import { runAggressiveCalendarCleanup, runNuclearCleanup } from '@/utils/calendarCleanup';

const ResourceView = () => {
  // Use the new real-time calendar events hook
  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  
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
  
  // Using useState with localStorage to track setup completion
  const [setupDone, setSetupDone] = useState(() => {
    return localStorage.getItem('eventsSetupDone') === 'true';
  });
  
  // Staff selection dialog state
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamTitle, setSelectedTeamTitle] = useState('');
  
  // Use staff operations hook
  const { handleStaffDrop } = useStaffOperations(currentDate);

  // IMMEDIATE CLEANUP on component mount
  useEffect(() => {
    const runImmediateCleanup = async () => {
      console.log('ResourceView: Running immediate aggressive cleanup...');
      
      // Show user options
      const shouldRunAggressive = window.confirm(
        'MASSIVE DUPLICATES DETECTED! Would you like to run AGGRESSIVE cleanup to remove all duplicates? This will keep only the oldest event for each booking.'
      );
      
      if (shouldRunAggressive) {
        await runAggressiveCalendarCleanup();
        // Refresh events after cleanup
        setTimeout(() => {
          refreshEvents();
        }, 2000);
      } else {
        const shouldRunNuclear = window.confirm(
          'Would you like to run NUCLEAR cleanup instead? This will DELETE ALL calendar events and start fresh. WARNING: This cannot be undone!'
        );
        
        if (shouldRunNuclear) {
          await runNuclearCleanup();
          // Refresh events after nuclear cleanup
          setTimeout(() => {
            refreshEvents();
          }, 2000);
        }
      }
    };
    
    // Run cleanup immediately if we detect massive duplicates
    const duplicateCheckTimer = setTimeout(() => {
      if (events.length > 50) { // If more than 50 events, likely duplicates
        runImmediateCleanup();
      }
    }, 1000);
    
    return () => clearTimeout(duplicateCheckTimer);
  }, [events.length, refreshEvents]);
  
  // Setup completed flag to prevent multiple setups - DISABLED
  useEffect(() => {
    if (resources.length > 0 && !setupDone && teamResources.some(r => r.id === 'team-6')) {
      // Move all yellow events (event type = "event") to Team 6 - ONLY if no events exist for team-6
      const team6Id = 'team-6';
      const moveYellowEvents = async () => {
        try {
          // Check if team-6 already has events
          const team6Events = events.filter(e => e.resourceId === team6Id);
          if (team6Events.length > 0) {
            console.log('Team 6 already has events, skipping move operation');
            localStorage.setItem('eventsSetupDone', 'true');
            setSetupDone(true);
            return;
          }
          
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
  }, [resources, setupDone, teamResources, events]);

  // Function to open the staff selection dialog
  const handleOpenStaffSelectionDialog = (teamId: string, teamTitle: string) => {
    console.log('ResourceView: Opening staff selection dialog for team:', teamId, teamTitle);
    setSelectedTeamId(teamId);
    setSelectedTeamTitle(teamTitle);
    setStaffDialogOpen(true);
  };

  // Handle staff assignment updated callback
  const handleStaffAssigned = async (staffId: string, staffName: string): Promise<void> => {
    console.log('Staff assigned, refreshing...');
    // Force refresh of staff assignments
  };

  // Handle date change from navigation header
  const handleDateChange = (newDate: Date) => {
    handleDatesSet({ start: newDate });
  };

  // Wrapper function to ensure Promise<void> return type
  const handleRefresh = async (): Promise<void> => {
    await refreshEvents();
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <StaffSyncManager currentDate={currentDate} />
      
      <ResourceLayout 
        showStaffDisplay={false}
        staffDisplay={<div>Staff Display Placeholder</div>} 
        isMobile={isMobile}>
        {/* Date Navigation Header */}
        <DateNavigationHeader
          currentDate={currentDate}
          onDateChange={handleDateChange}
        />
        
        {/* ResourceHeader component with team management controls */}
        <ResourceHeader
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />

        {/* Toolbar with Update Button and EMERGENCY CLEANUP */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <ResourceToolbar
            isLoading={isLoading}
            currentDate={currentDate}
            resources={resources}
            onRefresh={handleRefresh}
            onAddTask={addEventToCalendar}
          />
          
          {/* EMERGENCY CLEANUP BUTTONS */}
          <div className="flex gap-2">
            <button
              onClick={runAggressiveCalendarCleanup}
              className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
              title="Remove all duplicate events, keep oldest"
            >
              CLEANUP DUPLICATES
            </button>
            <button
              onClick={runNuclearCleanup}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              title="DELETE ALL calendar events"
            >
              NUCLEAR CLEANUP
            </button>
          </div>
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
