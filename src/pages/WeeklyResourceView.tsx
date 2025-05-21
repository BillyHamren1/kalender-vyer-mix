
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WeeklyResourceCalendar from '@/components/Calendar/WeeklyResourceCalendar';

const WeeklyResourceView = () => {
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
  
  // Week navigation
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date(currentDate);
    // Set to the start of the current week (Sunday)
    const day = today.getDay();
    today.setDate(today.getDate() - day);
    return today;
  });

  useEffect(() => {
    // When currentDate changes from outside, reset the week view
    const newWeekStart = new Date(currentDate);
    const day = newWeekStart.getDay();
    newWeekStart.setDate(newWeekStart.getDate() - day);
    setCurrentWeekStart(newWeekStart);
  }, [currentDate]);

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

  // Navigation functions
  const goToPreviousWeek = () => {
    const prevWeek = new Date(currentWeekStart);
    prevWeek.setDate(prevWeek.getDate() - 7);
    setCurrentWeekStart(prevWeek);
  };

  const goToNextWeek = () => {
    const nextWeek = new Date(currentWeekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setCurrentWeekStart(nextWeek);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    today.setDate(today.getDate() - day);
    setCurrentWeekStart(today);
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

        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-4">
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
            >
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
            currentDate={currentDate}
            resources={resources}
            onRefresh={refreshEvents}
            onAddTask={addEventToCalendar}
          />
        </div>
        
        {/* Calendar */}
        <div className="weekly-view-container overflow-x-auto">
          <WeeklyResourceCalendar
            events={events}
            resources={resources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentWeekStart}
            onDateSet={handleDatesSet}
            refreshEvents={refreshEvents}
            onStaffDrop={handleStaffDrop}
            forceRefresh={staffAssignmentsUpdated}
          />
        </div>
      </ResourceLayout>
    </DndProvider>
  );
};

export default WeeklyResourceView;
