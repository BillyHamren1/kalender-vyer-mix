
import React from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useEventActions } from '@/hooks/useEventActions';
import ResourceHeader from '@/components/Calendar/ResourceHeader';
import ResourceCalendar from '@/components/Calendar/ResourceCalendar';
import '../styles/calendar.css';
// react-dnd is imported by StaffAssignmentRow component

const ResourceView = () => {
  // Use our custom hooks to manage state and logic
  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet
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
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <ResourceHeader
          teamResources={teamResources}
          teamCount={teamCount}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />
        
        <div className="bg-white rounded-lg shadow-md p-4">
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
