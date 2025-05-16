
import React from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import '../styles/calendar.css';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
// react-dnd is imported by StaffAssignmentRow component

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
  
  const { addEventToCalendar } = useEventActions(events, setEvents, resources);
  const isMobile = useIsMobile();
  
  const handleRefresh = async () => {
    toast.loading("Refreshing calendar...");
    await refreshEvents();
    toast.dismiss();
    toast.success("Calendar refreshed");
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`container mx-auto pt-2 ${isMobile ? 'px-2' : ''}`} style={{ maxWidth: isMobile ? '100%' : '94%' }}>
        <div className="flex justify-between items-center mb-4">
          <ResourceHeader 
            teamResources={teamResources}
            teamCount={teamCount}
            onAddTeam={addTeam}
            onRemoveTeam={removeTeam}
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
          />
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Calendar
          </Button>
        </div>
        
        <div className={`bg-white rounded-lg shadow-md ${isMobile ? 'p-2' : 'p-3'}`}>
          <ResourceCalendar
            events={events}
            resources={resources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentDate}
            onDateSet={handleDatesSet}
          />
        </div>
      </div>
    </div>
  );
};

export default ResourceView;
