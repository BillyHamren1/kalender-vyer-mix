
import React, { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useWeeklyStaffOperations } from '@/hooks/useWeeklyStaffOperations';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';
import StaffSelectionDialog from '@/components/Calendar/StaffSelectionDialog';
import { startOfWeek } from 'date-fns';

const CustomCalendarPage = () => {
  const navigate = useNavigate();
  
  // Use existing hooks for data consistency
  const {
    events,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  
  const { teamResources } = useTeamResources();
  
  // Week navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 1 });
  });

  // Use the new weekly staff operations hook
  const weeklyStaffOps = useWeeklyStaffOperations(currentWeekStart);

  // Staff selection dialog state
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{
    resourceId: string;
    resourceTitle: string;
    targetDate: Date;
  } | null>(null);

  // Handle staff drop operations
  const handleStaffDrop = async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    const effectiveDate = targetDate || hookCurrentDate;
    console.log('CustomCalendarPage: Staff drop', { staffId, resourceId, targetDate: effectiveDate });
    
    try {
      await weeklyStaffOps.handleStaffDrop(staffId, resourceId, effectiveDate);
    } catch (error) {
      console.error('CustomCalendarPage: Error in staff drop:', error);
    }
  };

  // Handle opening staff selection dialog
  const handleOpenStaffSelection = (resourceId: string, resourceTitle: string, targetDate: Date) => {
    console.log('Opening staff selection for:', { resourceId, resourceTitle, targetDate });
    setSelectedTeam({ resourceId, resourceTitle, targetDate });
    setStaffDialogOpen(true);
  };

  // Handle staff assignment from dialog
  const handleStaffAssigned = async (staffId: string, staffName: string) => {
    if (selectedTeam) {
      console.log('Assigning staff from dialog:', { staffId, staffName, team: selectedTeam });
      await handleStaffDrop(staffId, selectedTeam.resourceId, selectedTeam.targetDate);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/weekly-view')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Original Calendar
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Custom Calendar (FullCalendar Replacement)</h1>
            </div>
            <div className="text-sm text-gray-500">
              No license restrictions • Built with React & CSS Grid
            </div>
          </div>
        </div>

        {/* Calendar Container */}
        <div className="p-6">
          <CustomCalendar
            events={events}
            resources={teamResources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentWeekStart}
            onDateSet={handleDatesSet}
            refreshEvents={refreshEvents}
            onStaffDrop={handleStaffDrop}
            onOpenStaffSelection={handleOpenStaffSelection}
            viewMode="weekly"
            weeklyStaffOperations={weeklyStaffOps}
          />
        </div>

        {/* Available Staff Panel */}
        <AvailableStaffDisplay
          currentDate={currentWeekStart}
          onStaffDrop={handleStaffDrop}
          availableStaff={weeklyStaffOps.getAvailableStaffForWeek()}
          isLoading={weeklyStaffOps.isLoading}
        />

        {/* Staff Selection Dialog */}
        {selectedTeam && (
          <StaffSelectionDialog
            resourceId={selectedTeam.resourceId}
            resourceTitle={selectedTeam.resourceTitle}
            currentDate={selectedTeam.targetDate}
            open={staffDialogOpen}
            onOpenChange={setStaffDialogOpen}
            onStaffAssigned={handleStaffAssigned}
            availableStaff={weeklyStaffOps.getAvailableStaffForWeek()}
          />
        )}
      </div>
    </DndProvider>
  );
};

export default CustomCalendarPage;
