
import React, { useEffect, useState } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import StaffAssignmentRow from '@/components/Calendar/StaffAssignmentRow';
import DayNavigation from '@/components/Calendar/DayNavigation';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import '../styles/calendar.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { assignStaffToTeam, removeStaffAssignment, fetchStaffAssignments, syncStaffMember } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import AddTeamButton from '@/components/Calendar/AddTeamButton';
import ResourceHeader from '@/components/Calendar/ResourceHeader';

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
  
  const { addEventToCalendar, duplicateEvent } = useEventActions(events, setEvents, resources);
  const isMobile = useIsMobile();
  const [staffAssignmentsUpdated, setStaffAssignmentsUpdated] = useState(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  
  // Fetch events when this view is mounted
  useEffect(() => {
    refreshEvents();
  }, []);
  
  // Determine if we should show the Staff Assignment Row - only show on desktop in day view
  const shouldShowStaffAssignmentRow = () => {
    return !isMobile;
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
      if (resourceId) {
        toast.info(`Assigning staff ${staffId} to team ${resourceId}...`);
        await assignStaffToTeam(staffId, resourceId, currentDate);
        toast.success('Staff assigned to team successfully');
      } else {
        toast.info(`Removing staff ${staffId} assignment...`);
        await removeStaffAssignment(staffId, currentDate);
        toast.success('Staff assignment removed successfully');
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
          {/* Resource Header with Add Team Button */}
          <ResourceHeader
            teamResources={teamResources}
            teamCount={teamCount}
            onAddTeam={addTeam}
            onRemoveTeam={removeTeam}
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
          />
        
          <div className={`bg-white rounded-lg shadow-md mb-4 ${isMobile ? 'p-2' : 'p-3'}`}>
            {/* Day Navigation Bar - displayed above the calendar */}
            <div className="flex justify-between items-center mb-4">
              <DayNavigation currentDate={currentDate} />
              <AddTeamButton 
                onAddTeam={addTeam} 
                onRemoveTeam={removeTeam} 
                teamCount={teamCount} 
                teamResources={teamResources} 
              />
            </div>
            
            <ResourceCalendar
              events={events}
              resources={resources}
              isLoading={isLoading}
              isMounted={isMounted}
              currentDate={currentDate}
              onDateSet={handleDatesSet}
              refreshEvents={refreshEvents}
            />
          </div>
          
          {/* Available Staff Display */}
          {shouldShowStaffAssignmentRow() && (
            <div className="mt-4">
              <AvailableStaffDisplay 
                currentDate={currentDate} 
                onStaffDrop={handleStaffDrop}
              />
            </div>
          )}
          
          {/* Staff Assignment Row with current date */}
          {shouldShowStaffAssignmentRow() && (
            <div className="mt-4">
              <StaffAssignmentRow 
                resources={resources} 
                currentDate={currentDate}
                onStaffDrop={handleStaffDrop}
                forceRefresh={staffAssignmentsUpdated}
              />
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
};

export default ResourceView;
