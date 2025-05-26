
import React, { useEffect, useState, useCallback } from 'react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDateAwareStaffOperations } from '@/hooks/useDateAwareStaffOperations';
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
  // Use the new real-time calendar events hook
  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  
  // Use our custom hooks to manage state and logic
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
  const [selectedDate, setSelectedDate] = useState<Date>(hookCurrentDate);

  // Use date-aware staff operations
  const { handleStaffDrop, processingStaffIds } = useDateAwareStaffOperations();

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

  // Handle staff selection for a specific team AND date
  const handleOpenStaffSelectionDialog = useCallback((resourceId: string, resourceTitle: string, targetDate?: Date) => {
    console.log('WeeklyResourceView: Opening staff selection dialog for:', resourceId, resourceTitle, 'Date:', targetDate || hookCurrentDate);
    setSelectedResourceId(resourceId);
    setSelectedResourceTitle(resourceTitle);
    setSelectedDate(targetDate || hookCurrentDate);
    setStaffSelectionDialogOpen(true);
  }, [hookCurrentDate]);

  // Handle successful staff assignment with the date-aware system
  const handleStaffAssigned = useCallback(async (staffId: string, staffName: string) => {
    console.log(`WeeklyResourceView: Staff ${staffName} (${staffId}) assigned successfully to team ${selectedResourceId} for date:`, selectedDate);
    
    try {
      // Use the date-aware staff drop handler with the specific date
      await handleStaffDrop(staffId, selectedResourceId, selectedDate);
      console.log('WeeklyResourceView: Staff assignment completed successfully');
    } catch (error) {
      console.error('WeeklyResourceView: Error in staff assignment:', error);
    }
  }, [selectedResourceId, selectedDate, handleStaffDrop]);

  // Toggle staff display panel
  const handleToggleStaffDisplay = useCallback(() => {
    setShowStaffDisplay(prev => !prev);
  }, []);

  // Staff drop handler with date awareness - properly handles target dates
  const handleWeeklyStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    if (!targetDate) {
      console.error('WeeklyResourceView: No target date provided for staff drop');
      return;
    }

    console.log('WeeklyResourceView.handleWeeklyStaffDrop:', {
      staffId,
      resourceId,
      targetDate: format(targetDate, 'yyyy-MM-dd')
    });
    
    try {
      // Use the date-aware staff drop handler with the exact target date
      await handleStaffDrop(staffId, resourceId, targetDate);
      console.log('WeeklyResourceView: Staff drop completed successfully for date:', format(targetDate, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('WeeklyResourceView: Error in staff drop:', error);
      toast.error('Failed to update staff assignment');
    }
  }, [handleStaffDrop]);

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
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
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

      toast.success('Staff assignments copied successfully');
      
      // Trigger refresh
      window.dispatchEvent(new CustomEvent("staff-assignment-updated", { 
        detail: { date: format(currentWeekStart, 'yyyy-MM-dd') } 
      }));
      
    } catch (error) {
      console.error('Error copying assignments from previous week:', error);
      toast.error('Failed to copy staff assignments from previous week');
    }
  }, [currentWeekStart]);

  // Wrapper function to ensure Promise<void> return type
  const handleRefresh = async (): Promise<void> => {
    await refreshEvents();
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="weekly-resource-view-container">
        <StaffSyncManager currentDate={hookCurrentDate} />
        
        {/* Staff Selection Dialog */}
        <StaffSelectionDialog
          resourceId={selectedResourceId}
          resourceTitle={selectedResourceTitle}
          currentDate={selectedDate}
          open={staffSelectionDialogOpen}
          onOpenChange={setStaffSelectionDialogOpen}
          onStaffAssigned={handleStaffAssigned}
        />
        
        <ResourceLayout 
          showStaffDisplay={showStaffDisplay}
          staffDisplay={showStaffDisplay ? (
            <AvailableStaffDisplay 
              currentDate={hookCurrentDate} 
              onStaffDrop={handleWeeklyStaffDrop}
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
                  isLoading={isLoading || processingStaffIds.length > 0}
                  currentDate={hookCurrentDate}
                  resources={resources}
                  onRefresh={handleRefresh}
                  onAddTask={addEventToCalendar}
                  onShowStaffCurtain={handleToggleStaffDisplay}
                />
              </div>
            </div>
          </div>
          
          {/* Unified Calendar View with date-aware staff handling */}
          <div className="weekly-view-container overflow-x-auto">
            <UnifiedResourceCalendar
              events={events}
              resources={resources}
              isLoading={isLoading}
              isMounted={isMounted}
              currentDate={currentWeekStart}
              onDateSet={handleCalendarDateSet}
              refreshEvents={refreshEvents}
              onStaffDrop={handleWeeklyStaffDrop}
              onSelectStaff={handleOpenStaffSelectionDialog}
              forceRefresh={false}
              viewMode="weekly"
            />
          </div>
        </ResourceLayout>
      </div>
    </DndProvider>
  );
};

export default WeeklyResourceView;
