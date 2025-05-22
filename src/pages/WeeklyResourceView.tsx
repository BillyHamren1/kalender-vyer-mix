
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import StaffCurtain from '@/components/Calendar/StaffCurtain';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { assignStaffToTeam, removeStaffAssignment } from '@/services/staffService';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceLayout from '@/components/Calendar/ResourceLayout';
import ResourceToolbar from '@/components/Calendar/ResourceToolbar';
import StaffSyncManager from '@/components/Calendar/StaffSyncManager';
import { ChevronLeft, ChevronRight, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WeeklyResourceCalendar from '@/components/Calendar/WeeklyResourceCalendar';
import { format, addDays, startOfWeek } from 'date-fns';

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
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);
  
  // New state for staff curtain
  const [showStaffCurtain, setShowStaffCurtain] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  
  // Week navigation - managed independently from calendar's currentDate
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Set to the start of the current week (Sunday)
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 0 });
  });

  // Only update when hookCurrentDate changes, not on every render
  useEffect(() => {
    // When currentDate changes from outside, reset the week view
    setCurrentWeekStart(startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 0 }));
  }, [hookCurrentDate]);

  // Handle staff drop for assignment
  const handleStaffDrop = useCallback(async (staffId: string, resourceId: string | null) => {
    try {
      console.log(`Handling staff drop: staff=${staffId}, resource=${resourceId}`);
      if (resourceId) {
        toast.info(`Assigning staff ${staffId} to team ${resourceId}...`);
        try {
          await assignStaffToTeam(staffId, resourceId, hookCurrentDate);
          toast.success('Staff assigned to team successfully');
        } catch (error) {
          console.error('Error assigning staff to team:', error);
          toast.error('Failed to assign staff to team. Please try again.');
          return Promise.reject(error);
        }
      } else {
        toast.info(`Removing staff ${staffId} assignment...`);
        try {
          await removeStaffAssignment(staffId, hookCurrentDate);
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
  }, [hookCurrentDate]);

  // Handle team selection for staff assignment
  const handleTeamSelect = useCallback((teamId: string, teamName: string) => {
    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName);
    setShowStaffCurtain(true);
  }, []);

  // Navigation functions
  const goToPreviousWeek = useCallback(() => {
    const prevWeek = new Date(currentWeekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    setCurrentWeekStart(prevWeek);
  }, [currentWeekStart]);

  const goToNextWeek = useCallback(() => {
    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setCurrentWeekStart(nextWeek);
  }, [currentWeekStart]);

  const goToCurrentWeek = useCallback(() => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
  }, []);

  // Custom onDateSet function that prevents infinite loops
  const handleCalendarDateSet = useCallback((dateInfo: any) => {
    // Only pass the date to the parent hook if it's significantly different
    if (Math.abs(dateInfo.start.getTime() - hookCurrentDate.getTime()) > 3600000) {
      handleDatesSet(dateInfo);
    }
  }, [handleDatesSet, hookCurrentDate]);

  // Format the week range for display
  const weekRangeText = useMemo(() => {
    const endDate = addDays(currentWeekStart, 6);
    return `${format(currentWeekStart, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
  }, [currentWeekStart]);

  return (
    <DndProvider backend={HTML5Backend}>
      <StaffSyncManager currentDate={hookCurrentDate} />
      
      {/* Staff Curtain (new) */}
      {showStaffCurtain && (
        <StaffCurtain
          currentDate={hookCurrentDate}
          onSelectStaff={handleTeamSelect}
          onClose={() => setShowStaffCurtain(false)}
          onAssignStaff={handleStaffDrop}
        />
      )}
      
      <ResourceLayout 
        staffDisplay={
          <div className="p-2">
            <Button 
              variant="outline" 
              size="sm"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => setShowStaffCurtain(true)}
            >
              <Users className="h-4 w-4" />
              <span>Show Available Staff</span>
            </Button>
          </div>
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

        {/* Week Navigation and Header */}
        <div className="flex flex-col space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={goToPreviousWeek}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous Week
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={goToCurrentWeek}
                className="flex items-center gap-1"
              >
                <Calendar className="h-4 w-4" />
                Current Week
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={goToNextWeek}
                className="flex items-center gap-1"
              >
                Next Week
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            <ResourceToolbar
              isLoading={isLoading}
              currentDate={hookCurrentDate}
              resources={resources}
              onRefresh={refreshEvents}
              onAddTask={addEventToCalendar}
            />
          </div>
          
          <div className="text-lg font-medium text-center">
            {weekRangeText}
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
            forceRefresh={staffAssignmentsUpdated}
            onSelectStaff={handleTeamSelect}
          />
        </div>
      </ResourceLayout>
    </DndProvider>
  );
};

export default WeeklyResourceView;
