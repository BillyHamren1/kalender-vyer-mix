
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
import StaffCurtain from '@/components/Calendar/StaffCurtain';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WeeklyResourceCalendar from '@/components/Calendar/WeeklyResourceCalendar';
import { startOfWeek } from 'date-fns';

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
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Set to the start of the current week (Sunday)
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 0 });
  });

  // Get staff operations
  const {
    staffCurtainOpen,
    setStaffCurtainOpen,
    selectedTeamId,
    selectedTeamName,
    staffAssignmentsUpdated,
    handleStaffDrop,
    handleSelectStaffForTeam,
    handleShowStaffCurtain
  } = useStaffOperations(hookCurrentDate);

  // Only update when hookCurrentDate changes, not on every render
  useEffect(() => {
    // When currentDate changes from outside, reset the week view
    setCurrentWeekStart(startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 0 }));
  }, [hookCurrentDate]);

  // Custom onDateSet function that prevents infinite loops
  const handleCalendarDateSet = useCallback((dateInfo: any) => {
    // Only pass the date to the parent hook if it's significantly different
    if (Math.abs(dateInfo.start.getTime() - hookCurrentDate.getTime()) > 3600000) {
      handleDatesSet(dateInfo);
    }
  }, [handleDatesSet, hookCurrentDate]);

  return (
    <DndProvider backend={HTML5Backend}>
      <StaffSyncManager currentDate={hookCurrentDate} />
      
      {staffCurtainOpen && (
        <StaffCurtain 
          currentDate={hookCurrentDate}
          onSelectStaff={handleSelectStaffForTeam}
          onClose={() => setStaffCurtainOpen(false)}
          onAssignStaff={handleStaffDrop}
          selectedTeamId={selectedTeamId}
          selectedTeamName={selectedTeamName}
        />
      )}
      
      <ResourceLayout 
        showStaffDisplay={false}
        staffDisplay={<></>}
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
            
            <ResourceToolbar
              isLoading={isLoading}
              currentDate={hookCurrentDate}
              resources={resources}
              onRefresh={refreshEvents}
              onAddTask={addEventToCalendar}
              onShowStaffCurtain={handleShowStaffCurtain}
            />
          </div>
        </div>
        
        {/* Weekly Calendar View */}
        <div className="weekly-view-container overflow-x-auto">
          <WeeklyResourceCalendar
            events={events}
            resources={resources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentWeekStart}
            onDateSet={handleCalendarDateSet}
            refreshEvents={refreshEvents}
            onStaffDrop={handleStaffDrop}
            onSelectStaff={handleSelectStaffForTeam}
            forceRefresh={staffAssignmentsUpdated}
          />
        </div>
      </ResourceLayout>
    </DndProvider>
  );
};

export default WeeklyResourceView;
