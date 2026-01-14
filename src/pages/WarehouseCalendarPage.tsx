
import React, { useState, useEffect } from 'react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';

import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import MobileWarehouseCalendarView from '@/components/mobile/MobileWarehouseCalendarView';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WeekTabsNavigation from '@/components/Calendar/WeekTabsNavigation';
import { WarehouseCalendarView } from '@/components/Calendar/WarehouseCalendarView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { startOfWeek, startOfMonth, format } from 'date-fns';
import { Package, Users } from 'lucide-react';

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

const WarehouseCalendarPage = () => {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly' | 'list'>('weekly');
  const [calendarTab, setCalendarTab] = useState<'warehouse' | 'staff'>('warehouse');
  
  // Monthly view state (for desktop) - now used for the month tabs
  const [monthlyDate, setMonthlyDate] = useState<Date>(startOfMonth(new Date()));
  
  // Real-time calendar events
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
    const stored = localStorage.getItem('warehouseVisibleTeamsByDay');
    return stored ? JSON.parse(stored) : {};
  });

  // Save visible teams to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('warehouseVisibleTeamsByDay', JSON.stringify(visibleTeamsByDay));
  }, [visibleTeamsByDay]);

  // Get visible teams for a specific day
  const getVisibleTeamsForDay = (date: Date): string[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return visibleTeamsByDay[dateKey] || ['team-1', 'team-2', 'team-11'];
  };

  // Toggle team visibility for a specific day
  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay(prev => {
      const currentVisible = prev[dateKey] || ['team-1', 'team-2', 'team-11'];
      
      if (currentVisible.includes(teamId)) {
        if (['team-1', 'team-2', 'team-11'].includes(teamId)) {
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

  // Staff curtain state
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
    
    let position = { top: 100, left: 300 };
    
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      position = {
        top: rect.bottom + 5,
        left: Math.max(10, rect.left - 120)
      };
      
      if (position.left + 250 > window.innerWidth) {
        position.left = window.innerWidth - 260;
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
    setCurrentWeekStart(startOfWeek(startOfMonth(date), { weekStartsOn: 1 }));
  };

  return (
    <TooltipProvider>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation with view toggle */}
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentMonth={monthlyDate}
            onMonthChange={handleMonthChange}
          />

          {/* Content */}
          <div className="p-6">
            {/* Calendar type tabs */}
            <Tabs value={calendarTab} onValueChange={(v) => setCalendarTab(v as 'warehouse' | 'staff')} className="mb-4">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="warehouse" className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Lagerkalender
                </TabsTrigger>
                <TabsTrigger value="staff" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Personalplanering
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {calendarTab === 'warehouse' ? (
              // Warehouse-specific calendar with packing, delivery, etc.
              <WarehouseCalendarView 
                currentDate={currentWeekStart} 
                view="week" 
              />
            ) : (
              // Staff planning view (original calendar)
              <>
                {viewMode === 'weekly' ? (
                  <>
                    {isMobile ? (
                      <MobileWarehouseCalendarView events={events} />
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
                    )}
                  </>
                ) : viewMode === 'monthly' ? (
                  <>
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
                    <WeekTabsNavigation
                      currentMonth={monthlyDate}
                      currentWeekStart={currentWeekStart}
                      onWeekSelect={handleWeekSelect}
                    />
                  </>
                ) : (
                  <StaffBookingsList
                    events={events}
                    resources={teamResources}
                    currentDate={currentWeekStart}
                    weeklyStaffOperations={staffOps}
                  />
                )}
              </>
            )}
          </div>

          {/* Compact Staff Curtain */}
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

export default WarehouseCalendarPage;
