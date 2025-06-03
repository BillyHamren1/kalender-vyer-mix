
import React, { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useWeeklyStaffOperations } from '@/hooks/useWeeklyStaffOperations';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
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

  // Staff curtain state - simplified with position
  const [staffCurtainOpen, setStaffCurtainOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{
    resourceId: string;
    resourceTitle: string;
    targetDate: Date;
    position: { top: number; left: number };
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

  // Handle opening staff curtain with position
  const handleOpenStaffSelection = (resourceId: string, resourceTitle: string, targetDate: Date, buttonElement?: HTMLElement) => {
    console.log('Opening staff curtain for:', { resourceId, resourceTitle, targetDate });
    
    // Calculate position relative to the button
    let position = { top: 100, left: 300 }; // Default fallback position
    
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      position = {
        top: rect.bottom + 5, // Position below the button
        left: Math.max(10, rect.left - 120) // Position to the left of button, with minimum margin
      };
      
      // Adjust if it would go off-screen
      if (position.left + 250 > window.innerWidth) {
        position.left = window.innerWidth - 260; // Keep some margin from right edge
      }
    }
    
    setSelectedTeam({ resourceId, resourceTitle, targetDate, position });
    setStaffCurtainOpen(true);
  };

  // Handle staff assignment from curtain
  const handleStaffAssigned = async (staffId: string, teamId: string) => {
    if (selectedTeam) {
      console.log('Assigning staff from curtain:', { staffId, teamId, team: selectedTeam });
      await handleStaffDrop(staffId, teamId, selectedTeam.targetDate);
    }
  };

  // Close curtain
  const handleCloseCurtain = () => {
    setStaffCurtainOpen(false);
    setSelectedTeam(null);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <TooltipProvider>
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

          {/* Compact Staff Curtain - positioned relative to the + button */}
          {staffCurtainOpen && selectedTeam && (
            <SimpleStaffCurtain
              currentDate={selectedTeam.targetDate}
              onClose={handleCloseCurtain}
              onAssignStaff={handleStaffAssigned}
              selectedTeamId={selectedTeam.resourceId}
              selectedTeamName={selectedTeam.resourceTitle}
              availableStaff={weeklyStaffOps.getAvailableStaffForDate(selectedTeam.targetDate)}
              position={selectedTeam.position}
            />
          )}
        </div>
      </TooltipProvider>
    </DndProvider>
  );
};

export default CustomCalendarPage;
