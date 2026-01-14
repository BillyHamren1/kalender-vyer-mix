
import React, { useState, useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useIsMobile } from '@/hooks/use-mobile';

import { startOfWeek, subDays } from 'date-fns';
import UnifiedResourceCalendar from '@/components/Calendar/UnifiedResourceCalendar';
import StaffCurtain from '@/components/Calendar/StaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import SimpleMonthlyCalendar from '@/components/Calendar/SimpleMonthlyCalendar';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import MobileWarehouseCalendarView from '@/components/mobile/MobileWarehouseCalendarView';

const WarehouseCalendarPage = () => {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly' | 'list'>('weekly');
  const [monthlyDate, setMonthlyDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Visible teams state - default to Team 1, 2, and Live (team-11)
  const [visibleTeams, setVisibleTeams] = useState<string[]>(() => {
    // Clear any old localStorage values and set default
    localStorage.removeItem('warehouseVisibleTeams');
    const defaultTeams = ['team-1', 'team-2', 'team-11'];
    console.log('🎯 Initializing warehouse visibleTeams with:', defaultTeams);
    return defaultTeams;
  });

  // Debug log for visibleTeams changes
  useEffect(() => {
    console.log('🔄 Warehouse visibleTeams updated:', visibleTeams);
  }, [visibleTeams]);

  // Save visible teams to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('warehouseVisibleTeams', JSON.stringify(visibleTeams));
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

  // Handle day click in monthly view - switch to weekly view with clicked date centered
  const handleMonthlyDayClick = (date: Date) => {
    // Center the week around the clicked date by starting 3 days before
    const centeredWeekStart = subDays(date, 3);
    setCurrentWeekStart(centeredWeekStart);
    setSelectedDate(date);
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

  // Mobile view
  if (isMobile) {
    return <MobileWarehouseCalendarView events={events} />;
  }

  return (
    <TooltipProvider>
        <div className="min-h-screen bg-muted/30">
          {/* Navigation with Date and View Mode */}
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

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
                selectedDate={selectedDate}
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

export default WarehouseCalendarPage;
