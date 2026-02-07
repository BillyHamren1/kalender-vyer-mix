
import React, { useState, useEffect } from 'react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';

import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import MobileCalendarView from '@/components/mobile/MobileCalendarView';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import SimpleMonthlyCalendar from '@/components/Calendar/SimpleMonthlyCalendar';
import { startOfWeek, startOfMonth, format, subDays } from 'date-fns';

// Wrapper component to handle async loading of staff with status
const SimpleStaffCurtainWrapper: React.FC<{
  currentDate: Date;
  onClose: () => void;
  onAssignStaff: (staffId: string, teamId: string) => Promise<void>;
  selectedTeamId: string | null;
  selectedTeamName: string;
  staffOps: ReturnType<typeof useUnifiedStaffOperations>;
  position: { top: number; left: number };
}> = (props) => {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadStaff = async () => {
      if (!props.selectedTeamId) return;
      setLoading(true);
      // Use new function that returns ALL staff with their assignment status
      const staff = await props.staffOps.getStaffForPlanningDate(props.currentDate, props.selectedTeamId);
      setStaffList(staff);
      setLoading(false);
    };
    loadStaff();
  }, [props.currentDate, props.selectedTeamId, props.staffOps]);
  
  if (loading) {
    return null;
  }
  
  return (
    <SimpleStaffCurtain
      currentDate={props.currentDate}
      onClose={props.onClose}
      onAssignStaff={props.onAssignStaff}
      selectedTeamId={props.selectedTeamId}
      selectedTeamName={props.selectedTeamName}
      staffList={staffList}
      position={props.position}
    />
  );
};

const CustomCalendarPage = () => {
  const isMobile = useIsMobile();
  // Default to 'weekly' - the full 7-day view with all teams
  const [viewMode, setViewMode] = useState<'day' | 'weekly' | 'monthly' | 'list'>('weekly');
  
  // Monthly view state (for desktop) - now used for the month tabs
  const [monthlyDate, setMonthlyDate] = useState<Date>(startOfMonth(new Date()));
  
  // Real-time calendar events (these will update UI when background import updates DB)
  const {
    events,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  
  const { teamResources } = useTeamResources();
  
  // Week navigation state (for desktop) and month state (for mobile)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 1 });
  });

  const [currentMonthStart, setCurrentMonthStart] = useState(() => {
    return startOfMonth(new Date(hookCurrentDate));
  });

  // When switching to monthly mode, sync the month with current week
  useEffect(() => {
    if (viewMode === 'monthly') {
      setMonthlyDate(startOfMonth(currentWeekStart));
    }
  }, [viewMode]);

  // Visible teams state - per day { [dateString]: teamIds[] }
  const [visibleTeamsByDay, setVisibleTeamsByDay] = useState<{ [key: string]: string[] }>(() => {
    const stored = localStorage.getItem('visibleTeamsByDay');
    return stored ? JSON.parse(stored) : {};
  });

  // Save visible teams to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('visibleTeamsByDay', JSON.stringify(visibleTeamsByDay));
  }, [visibleTeamsByDay]);

  // Get visible teams for a specific day
  const getVisibleTeamsForDay = (date: Date): string[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return visibleTeamsByDay[dateKey] || ['team-1', 'team-2', 'team-3', 'team-4', 'team-11'];
  };

  // Toggle team visibility for a specific day
  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay(prev => {
      const currentVisible = prev[dateKey] || ['team-1', 'team-2', 'team-3', 'team-4', 'team-11'];
      
      if (currentVisible.includes(teamId)) {
        // Don't allow hiding Team 1-4 and Live
        if (['team-1', 'team-2', 'team-3', 'team-4', 'team-11'].includes(teamId)) {
          return prev;
        }
        return {
          ...prev,
          [dateKey]: currentVisible.filter(id => id !== teamId)
        };
      } else {
        return {
          ...prev,
          [dateKey]: [...currentVisible, teamId]
        };
      }
    });
  };

  // Use the unified staff operations hook
  const staffOps = useUnifiedStaffOperations(currentWeekStart, 'weekly');

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


  // Handle week selection from tabs (monthly view)
  const handleWeekSelect = (weekStart: Date) => {
    setCurrentWeekStart(weekStart);
  };

  // Handle month change in navigation (monthly view)
  const handleMonthChange = (date: Date) => {
    setMonthlyDate(startOfMonth(date));
    // Also update currentWeekStart to first week of new month
    setCurrentWeekStart(startOfWeek(startOfMonth(date), { weekStartsOn: 1 }));
  };

  return (
    <TooltipProvider>
        <div className="h-screen flex flex-col bg-muted/30">
          {/* Navigation with view toggle */}
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentMonth={monthlyDate}
            onMonthChange={handleMonthChange}
          />

          {/* Content - flex-1 to fill remaining space */}
          <div className="flex-1 min-h-0 p-4 overflow-hidden bg-card rounded-2xl mx-2 mb-2 shadow-sm">
            {viewMode === 'day' ? (
              // Day View - 3D Carousel with single focused day and side cards
              isMobile ? (
                <MobileCalendarView events={events} />
              ) : (
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
                  viewMode="day"
                  weeklyStaffOperations={staffOps}
                  getVisibleTeamsForDay={getVisibleTeamsForDay}
                  onToggleTeamForDay={handleToggleTeamForDay}
                  allTeams={teamResources}
                />
              )
            ) : viewMode === 'weekly' ? (
              // Weekly View - 7 days side by side with horizontal scroll
              isMobile ? (
                <MobileCalendarView events={events} />
              ) : (
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
                  getVisibleTeamsForDay={getVisibleTeamsForDay}
                  onToggleTeamForDay={handleToggleTeamForDay}
                  allTeams={teamResources}
                />
              )
            ) : viewMode === 'monthly' ? (
              // Monthly View - simple calendar overview
              isMobile ? (
                <MobileCalendarView events={events} />
              ) : (
                <SimpleMonthlyCalendar
                  events={events}
                  currentDate={monthlyDate}
                  onDateChange={handleMonthChange}
                  onDayClick={(date: Date) => {
                    // Center the week around the clicked date
                    const centeredWeekStart = subDays(date, 3);
                    setCurrentWeekStart(centeredWeekStart);
                    setViewMode('weekly');
                  }}
                />
              )
            ) : (
              // List View
              <StaffBookingsList
                events={events}
                resources={teamResources}
                currentDate={currentWeekStart}
                weeklyStaffOperations={staffOps}
              />
            )}
          </div>

          {/* Compact Staff Curtain - positioned relative to the + button */}
          {staffCurtainOpen && selectedTeam && (
            <SimpleStaffCurtainWrapper
              currentDate={selectedTeam.targetDate}
              onClose={handleCloseCurtain}
              onAssignStaff={handleStaffAssigned}
              selectedTeamId={selectedTeam.resourceId}
              selectedTeamName={selectedTeam.resourceTitle}
              staffOps={staffOps}
              position={selectedTeam.position}
            />
          )}
        </div>
      </TooltipProvider>
  );
};

export default CustomCalendarPage;
