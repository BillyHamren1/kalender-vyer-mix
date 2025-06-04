
import React, { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useBackgroundImport } from '@/hooks/useBackgroundImport';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowLeft, Calendar as CalendarIcon, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import { startOfWeek } from 'date-fns';

const CustomCalendarPage = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
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

  // Use the unified staff operations hook
  const staffOps = useUnifiedStaffOperations(currentWeekStart, 'weekly');

  // Add background import functionality
  const backgroundImport = useBackgroundImport({
    enableAutoImport: true,
    onImportComplete: (results) => {
      // Refresh calendar events after successful import
      refreshEvents();
    }
  });

  // Staff curtain state - simplified with position
  const [staffCurtainOpen, setStaffCurtainOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{
    resourceId: string;
    resourceTitle: string;
    targetDate: Date;
    position: { top: number; left: number };
  } | null>(null);

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
      await staffOps.handleStaffDrop(staffId, teamId, selectedTeam.targetDate);
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
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
                <h1 className="text-2xl font-bold text-gray-900">Staff Calendar</h1>
              </div>
              
              {/* View Toggle */}
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <Button
                    variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('calendar')}
                    className="flex items-center gap-2"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    Calendar View
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="flex items-center gap-2"
                  >
                    <List className="h-4 w-4" />
                    List View
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {viewMode === 'calendar' ? (
              <CustomCalendar
                events={events}
                resources={teamResources}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={currentWeekStart}
                onDateSet={handleDatesSet}
                refreshEvents={refreshEvents}
                onStaffDrop={staffOps.handleStaffDrop}
                onOpenStaffSelection={handleOpenStaffSelection}
                viewMode="weekly"
                weeklyStaffOperations={staffOps}
              />
            ) : (
              <StaffBookingsList
                events={events}
                resources={teamResources}
                currentDate={currentWeekStart}
                weeklyStaffOperations={staffOps}
                backgroundImport={backgroundImport}
              />
            )}
          </div>

          {/* Compact Staff Curtain - positioned relative to the + button */}
          {staffCurtainOpen && selectedTeam && (
            <SimpleStaffCurtain
              currentDate={selectedTeam.targetDate}
              onClose={handleCloseCurtain}
              onAssignStaff={handleStaffAssigned}
              selectedTeamId={selectedTeam.resourceId}
              selectedTeamName={selectedTeam.resourceTitle}
              availableStaff={staffOps.getAvailableStaffForDate(selectedTeam.targetDate)}
              position={selectedTeam.position}
            />
          )}
        </div>
      </TooltipProvider>
    </DndProvider>
  );
};

export default CustomCalendarPage;
