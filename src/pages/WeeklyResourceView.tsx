
import React, { useEffect, useState, useCallback } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useStaffOperations } from '@/hooks/useStaffOperations';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceLayout from '@/components/Calendar/ResourceLayout';
import ResourceToolbar from '@/components/Calendar/ResourceToolbar';
import StaffSyncManager from '@/components/Calendar/StaffSyncManager';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import UnifiedResourceCalendar from '@/components/Calendar/UnifiedResourceCalendar';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import TeamEditDialog from '@/components/Calendar/TeamEditDialog';
import { startOfWeek, subDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const WeeklyResourceView = () => {
  // Use our custom hooks to manage state and logic
  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
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
  
  // Week navigation - managed independently from calendar's currentDate
  // Set to the start of the current week (Monday)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 1 });
  });

  // State for showing staff display panel
  const [showStaffDisplay, setShowStaffDisplay] = useState(false);

  // Add state for staff selection dialog
  const [staffSelectionDialogOpen, setStaffSelectionDialogOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedResourceTitle, setSelectedResourceTitle] = useState('');

  // Get staff operations
  const {
    staffAssignmentsUpdated,
    handleStaffDrop,
  } = useStaffOperations(hookCurrentDate);

  // Only update when hookCurrentDate changes, not on every render
  useEffect(() => {
    // When currentDate changes from outside, reset the week view to start on Monday
    setCurrentWeekStart(startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 1 }));
  }, [hookCurrentDate]);

  // Custom onDateSet function that prevents infinite loops
  const handleCalendarDateSet = useCallback((dateInfo: any) => {
    // Only pass the date to the parent hook if it's significantly different
    if (Math.abs(dateInfo.start.getTime() - hookCurrentDate.getTime()) > 3600000) {
      handleDatesSet(dateInfo);
    }
  }, [handleDatesSet, hookCurrentDate]);

  // Handle staff selection for a specific team
  const handleOpenStaffSelectionDialog = useCallback((resourceId: string, resourceTitle: string) => {
    console.log('Opening staff selection dialog for:', resourceId, resourceTitle);
    setSelectedResourceId(resourceId);
    setSelectedResourceTitle(resourceTitle);
    setStaffSelectionDialogOpen(true);
  }, []);

  // Handle successful staff assignment
  const handleStaffAssigned = useCallback(() => {
    console.log('Staff assigned successfully, refreshing...');
    // Toggle the staffAssignmentsUpdated flag to trigger a refresh
    handleStaffDrop('', '');
  }, [handleStaffDrop]);

  // Toggle staff display panel
  const handleToggleStaffDisplay = useCallback(() => {
    setShowStaffDisplay(prev => !prev);
  }, []);

  // Copy staff assignments from previous week
  const handleCopyFromPreviousWeek = useCallback(async () => {
    try {
      const previousWeekStart = subDays(currentWeekStart, 7);
      const previousWeekEnd = subDays(currentWeekStart, 1);
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

      console.log(`Copying assignments from ${format(previousWeekStart, 'yyyy-MM-dd')} to ${format(previousWeekEnd, 'yyyy-MM-dd')}`);
      console.log(`To week ${format(currentWeekStart, 'yyyy-MM-dd')} to ${format(currentWeekEnd, 'yyyy-MM-dd')}`);

      // Get all staff assignments from the previous week
      const { data: previousAssignments, error: fetchError } = await supabase
        .from('staff_assignments')
        .select('*')
        .gte('assignment_date', format(previousWeekStart, 'yyyy-MM-dd'))
        .lte('assignment_date', format(previousWeekEnd, 'yyyy-MM-dd'));

      if (fetchError) {
        throw fetchError;
      }

      if (!previousAssignments || previousAssignments.length === 0) {
        toast.info('No assignments found', {
          description: 'No staff assignments found in the previous week to copy'
        });
        return;
      }

      // Create new assignments for the current week
      const newAssignments = previousAssignments.map(assignment => {
        const previousDate = new Date(assignment.assignment_date);
        const dayOfWeek = previousDate.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday (0) to 6, others to dayOfWeek - 1
        
        const newDate = new Date(currentWeekStart);
        newDate.setDate(currentWeekStart.getDate() + mondayOffset);

        return {
          staff_id: assignment.staff_id,
          team_id: assignment.team_id,
          assignment_date: format(newDate, 'yyyy-MM-dd')
        };
      });

      // Insert the new assignments
      const { error: insertError } = await supabase
        .from('staff_assignments')
        .upsert(newAssignments, {
          onConflict: 'staff_id,assignment_date',
          ignoreDuplicates: false
        });

      if (insertError) {
        throw insertError;
      }

      // Trigger a refresh of the calendar
      handleStaffDrop('', '');
      
    } catch (error) {
      console.error('Error copying assignments from previous week:', error);
      throw error;
    }
  }, [currentWeekStart, handleStaffDrop]);

  return (
    <DndProvider backend={HTML5Backend}>
      <StaffSyncManager currentDate={hookCurrentDate} />
      
      {/* Staff Selection Dialog */}
      <StaffSelectionDialog
        resourceId={selectedResourceId}
        resourceTitle={selectedResourceTitle}
        currentDate={hookCurrentDate}
        open={staffSelectionDialogOpen}
        onOpenChange={setStaffSelectionDialogOpen}
        onStaffAssigned={handleStaffAssigned}
      />
      
      <ResourceLayout 
        showStaffDisplay={showStaffDisplay}
        staffDisplay={showStaffDisplay ? (
          <AvailableStaffDisplay 
            currentDate={hookCurrentDate} 
            onStaffDrop={handleStaffDrop}
          />
        ) : <></>}
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

        {/* Week Navigation and Header */}
        <div className="flex flex-col space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <WeekNavigation 
              currentWeekStart={currentWeekStart}
              setCurrentWeekStart={setCurrentWeekStart}
            />
            
            <div className="flex items-center gap-2">
              <TeamEditDialog
                teamResources={teamResources}
                teamCount={teamCount}
                onAddTeam={addTeam}
                onRemoveTeam={removeTeam}
                currentWeekStart={currentWeekStart}
                onCopyFromPreviousWeek={handleCopyFromPreviousWeek}
              />
              
              <ResourceToolbar
                isLoading={isLoading}
                currentDate={hookCurrentDate}
                resources={resources}
                onRefresh={refreshEvents}
                onAddTask={addEventToCalendar}
                onShowStaffCurtain={handleToggleStaffDisplay}
              />
            </div>
          </div>
        </div>
        
        {/* Unified Calendar View */}
        <div className="weekly-view-container overflow-x-auto">
          <UnifiedResourceCalendar
            events={events}
            resources={resources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentWeekStart}
            onDateSet={handleCalendarDateSet}
            refreshEvents={refreshEvents}
            onStaffDrop={handleStaffDrop}
            onSelectStaff={handleOpenStaffSelectionDialog}
            forceRefresh={staffAssignmentsUpdated}
            viewMode="weekly"
          />
        </div>
      </ResourceLayout>
    </DndProvider>
  );
};

export default WeeklyResourceView;
