
import React, { useEffect, useState, useCallback } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import { useIsMobile } from '@/hooks/use-mobile';
import { useReliableStaffOperations } from '@/hooks/useReliableStaffOperations';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceLayout from '@/components/Calendar/ResourceLayout';
import ResourceToolbar from '@/components/Calendar/ResourceToolbar';
import StaffSyncManager from '@/components/Calendar/StaffSyncManager';
import MonthNavigation from '@/components/Calendar/MonthNavigation';
import UnifiedResourceCalendar from '@/components/Calendar/UnifiedResourceCalendar';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import TeamManagementDialog from '@/components/Calendar/TeamManagementDialog';
import { startOfMonth } from 'date-fns';
import { toast } from 'sonner';

const MonthlyResourceView = () => {
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
  
  const { addEventToCalendar, duplicateEvent } = useEventActions(events, setEvents, resources);
  const isMobile = useIsMobile();
  
  // Month navigation - managed independently from calendar's currentDate
  const [currentMonthStart, setCurrentMonthStart] = useState(() => {
    return startOfMonth(new Date(hookCurrentDate));
  });

  // State for showing staff display panel
  const [showStaffDisplay, setShowStaffDisplay] = useState(false);

  // Add state for staff selection dialog
  const [staffSelectionDialogOpen, setStaffSelectionDialogOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedResourceTitle, setSelectedResourceTitle] = useState('');

  // Get reliable staff operations - single instance
  const {
    handleStaffDrop,
    refreshTrigger
  } = useReliableStaffOperations(hookCurrentDate);

  // Enhanced staff drop handler with logging and instant updates
  const handleMonthlyStaffDrop = useCallback(async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    console.log('MonthlyResourceView.handleMonthlyStaffDrop:', {
      staffId,
      resourceId,
      targetDate: targetDate ? targetDate.toISOString().split('T')[0] : 'undefined'
    });
    
    try {
      // Use the reliable staff drop handler - it handles optimistic updates
      await handleStaffDrop(staffId, resourceId);
      console.log('MonthlyResourceView: Staff drop completed successfully');
    } catch (error) {
      console.error('MonthlyResourceView: Error in staff drop:', error);
      toast.error('Failed to update staff assignment');
    }
  }, [handleStaffDrop]);

  // Handle staff assignment - simplified to just trigger the reliable handler
  const handleStaffAssigned = useCallback(async (staffId: string, staffName: string) => {
    console.log(`MonthlyResourceView: Staff ${staffName} (${staffId}) assigned successfully to team ${selectedResourceId}`);
    
    try {
      // Use the reliable staff drop handler
      await handleStaffDrop(staffId, selectedResourceId);
      console.log('MonthlyResourceView: Staff assignment completed successfully');
    } catch (error) {
      console.error('MonthlyResourceView: Error in staff assignment:', error);
      toast.error('Failed to assign staff');
    }
  }, [selectedResourceId, handleStaffDrop]);

  // Only update when hookCurrentDate changes, not on every render
  useEffect(() => {
    setCurrentMonthStart(startOfMonth(new Date(hookCurrentDate)));
  }, [hookCurrentDate]);

  const handleCalendarDateSet = useCallback((dateInfo: any) => {
    if (Math.abs(dateInfo.start.getTime() - hookCurrentDate.getTime()) > 3600000) {
      handleDatesSet(dateInfo);
    }
  }, [handleDatesSet, hookCurrentDate]);

  const handleOpenStaffSelectionDialog = useCallback((resourceId: string, resourceTitle: string) => {
    setSelectedResourceId(resourceId);
    setSelectedResourceTitle(resourceTitle);
    setStaffSelectionDialogOpen(true);
  }, []);

  const handleToggleStaffDisplay = useCallback(() => {
    setShowStaffDisplay(prev => !prev);
  }, []);

  // Simplified refresh - no redundant calls
  const handleRefresh = async (): Promise<void> => {
    await refreshEvents();
  };

  // Convert refreshTrigger to number for compatibility with UnifiedResourceCalendar
  const forceRefreshNumber = refreshTrigger || 0;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="monthly-resource-view-container">
        <StaffSyncManager currentDate={hookCurrentDate} />
        
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
              onStaffDrop={handleMonthlyStaffDrop}
            />
          ) : <></>}
          isMobile={isMobile}
        >
          <ResourceHeader
            teamResources={teamResources}
            teamCount={teamCount}
            onAddTeam={addTeam}
            onRemoveTeam={removeTeam}
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
          />

          {/* ResourceToolbar by itself */}
          <div className="flex justify-end mb-4">
            <ResourceToolbar
              isLoading={isLoading}
              currentDate={hookCurrentDate}
              resources={resources}
              onRefresh={handleRefresh}
              onAddTask={addEventToCalendar}
              onShowStaffCurtain={handleToggleStaffDisplay}
            />
          </div>
          
          {/* MonthNavigation with Edit button aligned */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1"></div>
            <div className="flex-1 flex justify-center">
              <MonthNavigation 
                currentMonthStart={currentMonthStart}
                setCurrentMonthStart={setCurrentMonthStart}
              />
            </div>
            <div className="flex-1 flex justify-end">
              <TeamManagementDialog
                teamResources={teamResources}
                teamCount={teamCount}
                onAddTeam={addTeam}
                onRemoveTeam={removeTeam}
                dialogOpen={dialogOpen}
                setDialogOpen={setDialogOpen}
              />
            </div>
          </div>
          
          <div className="weekly-view-container overflow-x-auto">
            <UnifiedResourceCalendar
              events={events}
              resources={resources}
              isLoading={isLoading}
              isMounted={isMounted}
              currentDate={hookCurrentDate}
              onDateSet={handleCalendarDateSet}
              refreshEvents={refreshEvents}
              onStaffDrop={handleMonthlyStaffDrop}
              onSelectStaff={handleOpenStaffSelectionDialog}
              forceRefresh={forceRefreshNumber}
              viewMode="monthly"
            />
          </div>
        </ResourceLayout>
      </div>
    </DndProvider>
  );
};

export default MonthlyResourceView;
