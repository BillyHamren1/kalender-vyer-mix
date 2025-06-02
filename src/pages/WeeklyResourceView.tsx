
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDateAwareStaffOperations } from '@/hooks/useDateAwareStaffOperations';
import { useEnhancedStaffOperations } from '@/hooks/useEnhancedStaffOperations';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceLayout from '@/components/Calendar/ResourceLayout';
import ResourceToolbar from '@/components/Calendar/ResourceToolbar';
import StaffSyncManager from '@/components/Calendar/StaffSyncManager';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import TeamEditDialog from '@/components/Calendar/TeamEditDialog';
import ActionsDropdown from '@/components/Calendar/ActionsDropdown';
import { startOfWeek, subDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import StaffPlanningHeader from '@/components/Calendar/StaffPlanningHeader';
import { quietImportBookings } from '@/services/importService';

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
  
  // Use reliable staff operations with direct database access
  const reliableStaffOps = useReliableStaffOperations(hookCurrentDate);
  
  // Add state for tracking import status
  const [isImporting, setIsImporting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  
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

  // Use date-aware staff operations as fallback
  const { handleStaffDrop: fallbackStaffDrop, processingStaffIds } = useDateAwareStaffOperations();

  // Background import function
  const performBackgroundImport = useCallback(async (showToasts = false) => {
    if (!mountedRef.current) return;
    
    try {
      setIsImporting(true);
      console.log('Weekly Calendar: Performing background import...');
      
      const result = await quietImportBookings();
      
      if (result.success && result.results) {
        const newCount = result.results.new_bookings?.length || 0;
        const updatedCount = result.results.updated_bookings?.length || 0;
        const skippedCount = result.results.cancelled_bookings_skipped?.length || 0;
        
        if (showToasts && (newCount > 0 || updatedCount > 0)) {
          const messages = [];
          if (newCount > 0) messages.push(`${newCount} new booking${newCount > 1 ? 's' : ''}`);
          if (updatedCount > 0) messages.push(`${updatedCount} updated`);
          
          toast.success('Bookings refreshed', {
            description: messages.join(' and ') + ' found' + (skippedCount > 0 ? `, ${skippedCount} skipped` : '')
          });
        }
        
        console.log(`Weekly Calendar: Import completed - ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped`);
      }
    } catch (error) {
      console.error('Weekly Calendar: Error during background import:', error);
      if (showToasts) {
        toast.error('Failed to refresh bookings');
      }
    } finally {
      if (mountedRef.current) {
        setIsImporting(false);
      }
    }
  }, []);

  // Initialize calendar with background import
  const initializeCalendar = useCallback(async () => {
    console.log('Weekly Calendar: Initializing with background import...');
    await performBackgroundImport(false); // Don't show toasts on initial load
  }, [performBackgroundImport]);

  // Set up periodic background imports (REDUCED FREQUENCY to 10 minutes)
  useEffect(() => {
    // Initial import on mount
    initializeCalendar();
    
    // Set up periodic refresh - FURTHER REDUCED FREQUENCY
    intervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        performBackgroundImport(false); // Silent periodic imports
      }
    }, 10 * 60 * 1000); // 10 minutes instead of 5 minutes
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [initializeCalendar, performBackgroundImport]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

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
    const effectiveTargetDate = targetDate || hookCurrentDate;
    console.log('WeeklyResourceView: Opening staff selection dialog for:', resourceId, resourceTitle, 'Date:', format(effectiveTargetDate, 'yyyy-MM-dd'));
    setSelectedResourceId(resourceId);
    setSelectedResourceTitle(resourceTitle);
    setSelectedDate(effectiveTargetDate);
    setStaffSelectionDialogOpen(true);
  }, [hookCurrentDate]);

  // Handle successful staff assignment with reliable operations and target date
  const handleStaffAssigned = useCallback(async (staffId: string, staffName: string) => {
    console.log(`WeeklyResourceView: Staff ${staffName} (${staffId}) assigned successfully to team ${selectedResourceId} for date:`, format(selectedDate, 'yyyy-MM-dd'));
    
    try {
      // Use the reliable staff drop handler with the specific target date
      await reliableStaffOps.handleStaffDrop(staffId, selectedResourceId, selectedDate);
      console.log('WeeklyResourceView: Reliable staff assignment completed successfully for date:', format(selectedDate, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('WeeklyResourceView: Error in reliable staff assignment:', error);
      // Fallback to the original method only if reliable fails
      await fallbackStaffDrop(staffId, selectedResourceId, selectedDate);
    }
  }, [selectedResourceId, selectedDate, reliableStaffOps, fallbackStaffDrop]);

  // Toggle staff display panel
  const handleToggleStaffDisplay = useCallback(() => {
    setShowStaffDisplay(prev => !prev);
  }, []);

  // Enhanced staff drop handler with reliable operations and proper target date handling
  const handleWeeklyStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    if (!targetDate) {
      console.error('WeeklyResourceView: No target date provided for staff drop');
      return;
    }

    console.log('WeeklyResourceView.handleWeeklyStaffDrop (Reliable):', {
      staffId,
      resourceId,
      targetDate: format(targetDate, 'yyyy-MM-dd')
    });
    
    try {
      // Use reliable staff operations for direct database access with target date
      await reliableStaffOps.handleStaffDrop(staffId, resourceId, targetDate);
      console.log('WeeklyResourceView: Reliable staff drop completed successfully for date:', format(targetDate, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('WeeklyResourceView: Error in reliable staff drop, falling back:', error);
      // Fallback to the original method only if reliable fails
      await fallbackStaffDrop(staffId, resourceId, targetDate);
    }
  }, [reliableStaffOps, fallbackStaffDrop]);

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

      // Force refresh the enhanced operations
      reliableStaffOps.forceRefresh();
      
    } catch (error) {
      console.error('Error copying assignments from previous week:', error);
      toast.error('Failed to copy staff assignments from previous week');
    }
  }, [currentWeekStart, reliableStaffOps]);

  // Enhanced refresh function that includes booking import
  const handleRefresh = async (): Promise<void> => {
    console.log('Weekly Calendar: Manual refresh triggered');
    
    // Refresh calendar events
    await refreshEvents();
    
    // Force refresh staff operations
    reliableStaffOps.forceRefresh();
    
    // Perform background import with toast notifications
    await performBackgroundImport(true);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="fixed inset-0 flex flex-col bg-white overflow-hidden">
        <StaffSyncManager currentDate={hookCurrentDate} />
        
        {/* Staff Selection Dialog with reliable data */}
        <StaffSelectionDialog
          resourceId={selectedResourceId}
          resourceTitle={selectedResourceTitle}
          currentDate={selectedDate}
          open={staffSelectionDialogOpen}
          onOpenChange={setStaffSelectionDialogOpen}
          onStaffAssigned={handleStaffAssigned}
          reliableStaffOperations={{
            assignments: reliableStaffOps.compatibleAssignments,
            getStaffForTeam: reliableStaffOps.getStaffForTeam,
            handleStaffDrop: reliableStaffOps.handleStaffDrop
          }}
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
          {/* Top section with Staff Planning Header and Actions Dropdown */}
          <div className="relative">
            {/* Staff Planning Header with minimal top padding */}
            <div className="px-6 pt-1">
              <StaffPlanningHeader />
            </div>

            {/* Actions Dropdown in top right corner */}
            <div className="absolute top-1 right-6">
              <ActionsDropdown
                teamResources={teamResources}
                teamCount={teamCount}
                onAddTeam={addTeam}
                onRemoveTeam={removeTeam}
                currentWeekStart={currentWeekStart}
                onCopyFromPreviousWeek={handleCopyFromPreviousWeek}
                currentDate={hookCurrentDate}
                resources={resources}
                onAddTask={addEventToCalendar}
                onShowStaffCurtain={handleToggleStaffDisplay}
                isLoading={isLoading || processingStaffIds.length > 0 || reliableStaffOps.isLoading || isImporting}
              />
            </div>
          </div>

          {/* ResourceHeader component with team management controls - minimal padding */}
          <div className="pt-1">
            <ResourceHeader
              teamResources={teamResources}
              teamCount={teamCount}
              onAddTeam={addTeam}
              onRemoveTeam={removeTeam}
              dialogOpen={dialogOpen}
              setDialogOpen={setDialogOpen}
            />
          </div>

          {/* Week Navigation - CENTERED and standalone */}
          <div className="flex justify-center mb-1 flex-shrink-0">
            <WeekNavigation 
              currentWeekStart={currentWeekStart}
              setCurrentWeekStart={setCurrentWeekStart}
            />
          </div>
          
          {/* Custom Calendar View with horizontal team layout - Full height */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-x-auto">
              <CustomCalendar
                events={events}
                resources={resources}
                isLoading={isLoading || isImporting}
                isMounted={isMounted}
                currentDate={currentWeekStart}
                onDateSet={handleCalendarDateSet}
                refreshEvents={handleRefresh}
                onStaffDrop={handleWeeklyStaffDrop}
                onOpenStaffSelection={handleOpenStaffSelectionDialog}
                viewMode="weekly"
              />
            </div>
          </div>
        </ResourceLayout>
      </div>
    </DndProvider>
  );
};

export default WeeklyResourceView;
