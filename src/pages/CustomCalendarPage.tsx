import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { usePlannerSync } from '@/stores/plannerStore';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useTaskCalendarEvents } from '@/hooks/useTaskCalendarEvents';
import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/ui/PageHeader';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import MobileCalendarView from '@/components/mobile/MobileCalendarView';
import MobileEventsList from '@/components/mobile/MobileEventsList';
import MobileWarehouseWeekSelector from '@/components/mobile/MobileWarehouseWeekSelector';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WeekTabsNavigation from '@/components/Calendar/WeekTabsNavigation';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { startOfWeek, startOfMonth, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, ListChecks } from 'lucide-react';

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
  const navigate = useNavigate();
  // Default to 'weekly' - the full 7-day view with all teams
  const [viewMode, setViewMode] = useState<'day' | 'weekly' | 'monthly' | 'list'>('weekly');

  // Task overlay toggle (persisted in localStorage)
  const [showTasks, setShowTasks] = useState(() => {
    return localStorage.getItem('calendar-show-tasks') === 'true';
  });
  useEffect(() => {
    localStorage.setItem('calendar-show-tasks', String(showTasks));
  }, [showTasks]);

  // STORE SYNC: Bridge local state → central PlannerStore (legacy compatibility)
  const syncToStore = usePlannerSync();
  
  // Monthly view state (for desktop) - now used for the month tabs
  const [monthlyDate, setMonthlyDate] = useState<Date>(startOfMonth(new Date()));
  
  // Real-time calendar events (these will update UI when background import updates DB)
  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();

  // Task overlay events (only fetched when toggle is on)
  const { taskEvents } = useTaskCalendarEvents(showTasks);

  // Merge calendar events + task overlay
  const mergedEvents = useMemo(() => {
    if (!showTasks || taskEvents.length === 0) return events;
    return [...events, ...taskEvents];
  }, [events, taskEvents, showTasks]);

  // Handle task overlay click → navigate to project execution context
  const handleEventClick = async (event: any) => {
    const props = event.extendedProps;
    if (!props?.isTaskOverlay) return;

    // Direct large project link (no booking lookup needed)
    if (props.largeProjectId) {
      navigate(`/large-project/${props.largeProjectId}/establishment`, { state: { highlightTaskId: props.taskId } });
      return;
    }

    if (props.bookingId) {
      const { data } = await supabase
        .from("bookings")
        .select("assigned_project_id, large_project_id")
        .eq("id", props.bookingId)
        .single();

      if (data?.large_project_id) {
        navigate(`/large-project/${data.large_project_id}/establishment`, { state: { highlightTaskId: props.taskId } });
      } else if (data?.assigned_project_id) {
        navigate(`/project/${data.assigned_project_id}/execution`, { state: { highlightTaskId: props.taskId } });
      } else {
        // Booking has no project — navigate to booking but inform user
        toast.info("Bokningen saknar kopplat projekt. Skapa ett projekt för att hantera uppgifter i Utförande.");
        navigate(`/booking/${props.bookingId}`);
      }
    }
  };

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

  // STORE SYNC: Keep PlannerStore in sync with local state (legacy bridge)
  useEffect(() => {
    syncToStore({ selectedDate: currentWeekStart, viewMode });
  }, [currentWeekStart, viewMode, syncToStore]);

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
  const staffOps = useUnifiedStaffOperations(currentWeekStart, 'weekly', 'Montage');

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
  // Task overlay events are read-only (no drag/drop)
  const isEventReadOnly = (event: any) => !!event.extendedProps?.isTaskOverlay;

  return (
    <TooltipProvider>
        <div className="h-screen flex flex-col bg-background overflow-hidden theme-purple">
          

          {/* Task overlay toggle + Navigation */}
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex-1">
              <WeekNavigation
                currentWeekStart={currentWeekStart}
                setCurrentWeekStart={setCurrentWeekStart}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                currentMonth={monthlyDate}
                onMonthChange={handleMonthChange}
              />
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="show-tasks" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                Visa uppgifter
              </Label>
              <Switch
                id="show-tasks"
                checked={showTasks}
                onCheckedChange={setShowTasks}
              />
            </div>
          </div>

          {/* Content - flex-1 to fill remaining space */}
          <div className="flex-1 min-h-0 p-4 overflow-hidden bg-card rounded-2xl mx-2 mb-2 shadow-sm">
            {viewMode === 'day' ? (
              // Day View - 3D Carousel with single focused day and side cards
              isMobile ? (
                <MobileCalendarView events={mergedEvents} />
              ) : (
                <CustomCalendar
                  events={mergedEvents}
                  setEvents={setEvents}
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
                  onEventClick={handleEventClick}
                  isEventReadOnly={isEventReadOnly}
                />
              )
            ) : viewMode === 'weekly' ? (
              // Weekly View - 7 days side by side with horizontal scroll
              isMobile ? (
                <MobileCalendarView events={mergedEvents} />
              ) : (
                <CustomCalendar
                  events={mergedEvents}
                  setEvents={setEvents}
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
                  onEventClick={handleEventClick}
                  isEventReadOnly={isEventReadOnly}
                />
              )
            ) : viewMode === 'monthly' ? (
              // Monthly View - same day-grid style as warehouse calendar
              isMobile ? (
                <MobileCalendarView
                  events={mergedEvents}
                  currentMonth={monthlyDate}
                  selectedWeekStart={currentWeekStart}
                  onMonthChange={handleMonthChange}
                  onWeekSelect={handleWeekSelect}
                />
              ) : (
                <>
                  <CustomCalendar
                    events={mergedEvents}
                    setEvents={setEvents}
                    resources={teamResources}
                    isLoading={isLoading}
                    isMounted={isMounted}
                    currentDate={currentWeekStart}
                    onDateSet={handleDatesSet}
                    refreshEvents={refreshEvents}
                    onStaffDrop={staffOps.handleStaffDrop}
                    onOpenStaffSelection={handleOpenStaffSelection}
                    viewMode="monthly"
                    weeklyStaffOperations={staffOps}
                    getVisibleTeamsForDay={getVisibleTeamsForDay}
                    onToggleTeamForDay={handleToggleTeamForDay}
                    allTeams={teamResources}
                    onEventClick={handleEventClick}
                    isEventReadOnly={isEventReadOnly}
                  />
                  <WeekTabsNavigation
                    currentMonth={monthlyDate}
                    currentWeekStart={currentWeekStart}
                    onWeekSelect={handleWeekSelect}
                  />
                </>
              )
            ) : (
              // List View
              <StaffBookingsList
                events={mergedEvents}
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
