
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
import MonthNavigation from '@/components/Calendar/MonthNavigation';
import TestMonthlyResourceCalendar from '@/components/Calendar/TestMonthlyResourceCalendar';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import { startOfMonth } from 'date-fns';

const TestMonthlyView = () => {
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
  
  const [currentMonthStart, setCurrentMonthStart] = useState(() => {
    return startOfMonth(new Date(hookCurrentDate));
  });

  const [showStaffDisplay, setShowStaffDisplay] = useState(false);
  const [staffSelectionDialogOpen, setStaffSelectionDialogOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedResourceTitle, setSelectedResourceTitle] = useState('');

  const {
    staffAssignmentsUpdated,
    handleStaffDrop,
  } = useStaffOperations(hookCurrentDate);

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

  const handleStaffAssigned = useCallback(() => {
    handleStaffDrop('', '');
  }, [handleStaffDrop]);

  const handleToggleStaffDisplay = useCallback(() => {
    setShowStaffDisplay(prev => !prev);
  }, []);

  return (
    <DndProvider backend={HTML5Backend}>
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
            onStaffDrop={handleStaffDrop}
          />
        ) : <></>}
        isMobile={isMobile}
      >
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">Test: Dynamic Column Sizing</h2>
          <p className="text-blue-700 text-sm">
            This is a test page for experimenting with dynamic column sizing. 
            The center column should appear wider and more prominent as you scroll.
          </p>
        </div>

        <ResourceHeader
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />

        <div className="flex flex-col space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <MonthNavigation 
              currentMonthStart={currentMonthStart}
              setCurrentMonthStart={setCurrentMonthStart}
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
        
        <div className="test-monthly-view-container overflow-x-auto">
          <TestMonthlyResourceCalendar
            events={events}
            resources={resources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={hookCurrentDate}
            onDateSet={handleCalendarDateSet}
            refreshEvents={refreshEvents}
            onStaffDrop={handleStaffDrop}
            onSelectStaff={handleOpenStaffSelectionDialog}
            forceRefresh={staffAssignmentsUpdated}
          />
        </div>
      </ResourceLayout>
    </DndProvider>
  );
};

export default TestMonthlyView;
