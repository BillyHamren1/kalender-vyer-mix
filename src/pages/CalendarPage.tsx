
import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowLeft, Calendar as CalendarIcon, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useBackgroundImport } from '@/hooks/useBackgroundImport';
import { startOfWeek } from 'date-fns';
import UnifiedResourceCalendar from '@/components/Calendar/UnifiedResourceCalendar';
import StaffCurtain from '@/components/Calendar/StaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import SimpleMonthlyCalendar from '@/components/Calendar/SimpleMonthlyCalendar';
import TeamVisibilityControl from '@/components/Calendar/TeamVisibilityControl';

const CalendarPage = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly' | 'list'>('weekly');
  const [monthlyDate, setMonthlyDate] = useState(new Date());
  
  // Visible teams state - default to Team 1, 2, and Live (team-11)
  const [visibleTeams, setVisibleTeams] = useState<string[]>(() => {
    const stored = localStorage.getItem('visibleTeams');
    return stored ? JSON.parse(stored) : ['team-1', 'team-2', 'team-11'];
  });

  // Save visible teams to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('visibleTeams', JSON.stringify(visibleTeams));
  }, [visibleTeams]);
  
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

  // Use background import functionality - now takes no parameters
  const backgroundImport = useBackgroundImport();

  // Staff curtain state
  const [staffCurtainOpen, setStaffCurtainOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{
    resourceId: string;
    resourceTitle: string;
    targetDate: Date;
  } | null>(null);

  // Handle opening staff curtain
  const handleOpenStaffSelection = (resourceId: string, resourceTitle: string, targetDate: Date) => {
    console.log('Opening staff curtain for:', { resourceId, resourceTitle, targetDate });
    setSelectedTeam({ resourceId, resourceTitle, targetDate });
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

  // Handle staff selection for curtain (used by StaffCurtain component)
  const handleSelectStaff = (teamId: string, teamName: string) => {
    if (teamId && teamName) {
      setSelectedTeam(prev => prev ? { ...prev, resourceId: teamId, resourceTitle: teamName } : null);
    }
  };

  // Handle day click in monthly view - switch to weekly view
  const handleMonthlyDayClick = (date: Date) => {
    setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
    setViewMode('weekly');
  };

  // Handle month change in monthly view
  const handleMonthChange = (date: Date) => {
    setMonthlyDate(date);
  };

  // Toggle team visibility
  const handleToggleTeam = (teamId: string) => {
    setVisibleTeams(prev => {
      if (prev.includes(teamId)) {
        // Don't allow hiding Team 1, 2, and Live
        if (['team-1', 'team-2', 'team-11'].includes(teamId)) {
          return prev;
        }
        return prev.filter(id => id !== teamId);
      } else {
        return [...prev, teamId];
      }
    });
  };

  return (
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
                <h1 className="text-2xl font-bold text-gray-900">Staff Planning Calendar</h1>
              </div>
              
              {/* View Toggle and Team Visibility */}
              <div className="flex items-center gap-4">
                {/* Team Visibility Control */}
                <TeamVisibilityControl
                  allTeams={teamResources}
                  visibleTeams={visibleTeams}
                  onToggleTeam={handleToggleTeam}
                />
                
                <div className="flex bg-muted rounded-lg p-1">
                  <Button
                    variant={viewMode === 'weekly' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('weekly')}
                    className="flex items-center gap-2"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    Weekly
                  </Button>
                  <Button
                    variant={viewMode === 'monthly' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('monthly')}
                    className="flex items-center gap-2"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    Monthly
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="flex items-center gap-2"
                  >
                    <List className="h-4 w-4" />
                    List
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {viewMode === 'weekly' ? (
              <UnifiedResourceCalendar
                events={events}
                resources={teamResources}
                isLoading={isLoading}
                isMounted={isMounted}
                currentDate={currentWeekStart}
                onDateSet={handleDatesSet}
                refreshEvents={refreshEvents}
                onStaffDrop={staffOps.handleStaffDrop}
                onSelectStaff={handleOpenStaffSelection}
                viewMode="weekly"
                staffOperations={staffOps}
                visibleTeams={visibleTeams}
              />
            ) : viewMode === 'monthly' ? (
              <SimpleMonthlyCalendar
                events={events}
                currentDate={monthlyDate}
                onDateChange={handleMonthChange}
                onDayClick={handleMonthlyDayClick}
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

          {/* Staff Curtain */}
          {staffCurtainOpen && selectedTeam && (
            <StaffCurtain
              currentDate={selectedTeam.targetDate}
              onClose={handleCloseCurtain}
              onAssignStaff={handleStaffAssigned}
              onSelectStaff={handleSelectStaff}
              selectedTeamId={selectedTeam.resourceId}
              selectedTeamName={selectedTeam.resourceTitle}
            />
          )}
        </div>
      </TooltipProvider>
  );
};

export default CalendarPage;
