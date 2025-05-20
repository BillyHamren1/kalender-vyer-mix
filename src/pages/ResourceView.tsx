import React, { useEffect, useState } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import DayNavigation from '@/components/Calendar/DayNavigation';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import '../styles/calendar.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { assignStaffToTeam, removeStaffAssignment, fetchStaffAssignments, syncStaffMember } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import WeekTabNavigation from '@/components/Calendar/WeekTabNavigation';
import { moveEventsToTeam } from '@/services/teamService';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import AddTaskButton from '@/components/Calendar/AddTaskButton';

// Interface for external staff from API
interface ExternalStaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  isavailable: boolean;
}

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
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  
  // Using useState with localStorage to track setup completion
  const [setupDone, setSetupDone] = useState(() => {
    return localStorage.getItem('eventsSetupDone') === 'true';
  });
  
  // Setup completed flag to prevent multiple setups
  useEffect(() => {
    if (resources.length > 0 && !setupDone && teamResources.some(r => r.id === 'team-6')) {
      // Move all yellow events (event type = "event") to Team 6
      const team6Id = 'team-6';
      const moveYellowEvents = async () => {
        try {
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
  }, [resources, setupDone, teamResources]);
  
  // Determine if we should show the Available Staff Display - always show it now
  const shouldShowAvailableStaff = () => {
    return true; // Always show the staff display
  };
  
  // Prefetch and sync all staff before assignments
  const ensureStaffSynced = async () => {
    try {
      setIsLoadingStaff(true);
      const formattedDate = currentDate.toISOString().split('T')[0];
      
      // Call the edge function to get all staff
      const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
        body: { date: formattedDate }
      });
      
      if (error) {
        console.error('Error fetching staff data:', error);
        return;
      }
      
      if (data && data.success && data.data) {
        // Sync all staff members to our database
        const staffList = data.data as ExternalStaffMember[];
        
        for (const staff of staffList) {
          await syncStaffMember(
            staff.id,
            staff.name,
            staff.email || undefined,
            staff.phone || undefined
          );
        }
        
        console.log(`Synced ${staffList.length} staff members`);
      }
    } catch (error) {
      console.error('Error syncing staff:', error);
    } finally {
      setIsLoadingStaff(false);
    }
  };
  
  // Make sure to sync staff when the page loads
  useEffect(() => {
    ensureStaffSynced();
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

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50">
        <div className={`container mx-auto pt-2 ${isMobile ? 'px-2' : ''}`} style={{ maxWidth: isMobile ? '100%' : '94%' }}>
          <div className={`bg-white rounded-lg shadow-md mb-4 ${isMobile ? 'p-2' : 'p-3'}`}>
            {/* ResourceHeader component with team management controls */}
            <ResourceHeader
              teamResources={teamResources}
              teamCount={teamCount}
              onAddTeam={addTeam}
              onRemoveTeam={removeTeam}
              dialogOpen={dialogOpen}
              setDialogOpen={setDialogOpen}
            />

            {/* Week Navigation with Update Button positioned to the left */}
            <div className="flex items-center mb-4">
              <Button 
                onClick={refreshEvents} 
                variant="outline" 
                size="sm"
                disabled={isLoading}
                className="flex items-center gap-1 mr-3"
              >
                <RefreshCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                {isMobile ? '' : 'Update'}
              </Button>
              
              {/* Add Task Button */}
              <AddTaskButton 
                resources={resources}
                onTaskAdd={addEventToCalendar}
                currentDate={currentDate}
              />
              
              <div className="flex-grow">
                <DayNavigation currentDate={currentDate} />
              </div>
            </div>

            {/* Two-column layout for staff and calendar - Use grid or flex based on screen size */}
            <div className={`${isMobile ? 'flex flex-col' : 'grid'}`} 
                 style={{ gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: '1rem' }}>
              
              {/* Left column: Available Staff Display */}
              {shouldShowAvailableStaff() && (
                <div className={`${isMobile ? 'mb-4' : ''}`} style={{ marginTop: '39px' }}>
                  <AvailableStaffDisplay 
                    currentDate={currentDate} 
                    onStaffDrop={handleStaffDrop}
                  />
                </div>
              )}
              
              {/* Right column: Calendar */}
              <div className="flex-grow">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default ResourceView;
