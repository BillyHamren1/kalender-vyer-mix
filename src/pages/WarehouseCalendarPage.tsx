
import React, { useState, useEffect } from 'react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useWarehouseCalendarEvents, WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

import { useIsMobile } from '@/hooks/use-mobile';
import { TooltipProvider } from '@/components/ui/tooltip';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import MobileCalendarView from '@/components/mobile/MobileCalendarView';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WeekTabsNavigation from '@/components/Calendar/WeekTabsNavigation';
import { startOfWeek, startOfMonth, format } from 'date-fns';

// Map warehouse event types to CalendarEvent eventType
const mapWarehouseEventType = (warehouseType: string): CalendarEvent['eventType'] => {
  switch (warehouseType) {
    case 'packing':
      return 'packing';
    case 'delivery':
      return 'delivery';
    case 'return':
      return 'return';
    case 'inventory':
      return 'inventory';
    case 'unpacking':
      return 'unpacking';
    default:
      return 'event';
  }
};

// Map warehouse events to CalendarEvent format
const mapWarehouseEventsToCalendarEvents = (warehouseEvents: WarehouseEvent[]): CalendarEvent[] => {
  return warehouseEvents.map(we => ({
    id: we.id,
    title: we.title,
    start: we.start_time,
    end: we.end_time,
    resourceId: 'warehouse', // All warehouse events go to the 'warehouse' resource
    bookingId: we.booking_id,
    bookingNumber: we.booking_number || undefined,
    eventType: mapWarehouseEventType(we.event_type),
    deliveryAddress: we.delivery_address || undefined,
    viewed: we.viewed,
    extendedProps: {
      bookingNumber: we.booking_number || undefined,
      booking_id: we.booking_id,
      deliveryCity: we.delivery_address?.split(',')[0] || undefined,
      has_source_changes: we.has_source_changes,
      manually_adjusted: we.manually_adjusted,
      change_details: we.change_details || undefined
    }
  }));
};

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
  
  // Monthly view state (for desktop) - now used for the month tabs
  const [monthlyDate, setMonthlyDate] = useState<Date>(startOfMonth(new Date()));
  
  // Real-time calendar events (standard booking events)
  const {
    events: calendarEvents,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  
  // Week navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 1 });
  });

  const [currentMonthStart, setCurrentMonthStart] = useState(() => {
    return startOfMonth(new Date(hookCurrentDate));
  });
  
  // Warehouse-specific events
  const {
    events: warehouseEvents,
    loading: warehouseLoading,
    changedEventsCount
  } = useWarehouseCalendarEvents({ 
    currentDate: currentWeekStart, 
    view: viewMode === 'monthly' ? 'month' : 'week' 
  });
  
  // Combine standard calendar events with warehouse events
  const mappedWarehouseEvents = mapWarehouseEventsToCalendarEvents(warehouseEvents);
  const combinedEvents: CalendarEvent[] = [...calendarEvents, ...mappedWarehouseEvents];

  const { teamResources } = useTeamResources();
  
  // Add warehouse resource to the resources list
  const warehouseResource = {
    id: 'warehouse',
    title: 'Lager',
    eventColor: '#E5E7EB'
  };
  const resourcesWithWarehouse = [...teamResources, warehouseResource];

  // When switching to monthly mode, sync the month with current week
  useEffect(() => {
    if (viewMode === 'monthly') {
      setMonthlyDate(startOfMonth(currentWeekStart));
    }
  }, [viewMode]);

  // Visible teams state - per day { [dateString]: teamIds[] }
  // Use separate localStorage key for warehouse calendar
  const [visibleTeamsByDay, setVisibleTeamsByDay] = useState<{ [key: string]: string[] }>(() => {
    const stored = localStorage.getItem('warehouseVisibleTeamsByDay');
    return stored ? JSON.parse(stored) : {};
  });

  // Save visible teams to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('warehouseVisibleTeamsByDay', JSON.stringify(visibleTeamsByDay));
  }, [visibleTeamsByDay]);

  // Get visible teams for a specific day - include 'warehouse' by default
  const getVisibleTeamsForDay = (date: Date): string[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const stored = visibleTeamsByDay[dateKey];
    if (stored) {
      // Ensure warehouse is always included
      return stored.includes('warehouse') ? stored : [...stored, 'warehouse'];
    }
    // Default: team-1, team-2, team-11 (Live), and warehouse
    return ['team-1', 'team-2', 'team-11', 'warehouse'];
  };

  // Toggle team visibility for a specific day
  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay(prev => {
      const currentVisible = prev[dateKey] || ['team-1', 'team-2', 'team-11', 'warehouse'];
      
      if (currentVisible.includes(teamId)) {
        // Don't allow hiding Team 1, 2, Live, and Warehouse
        if (['team-1', 'team-2', 'team-11', 'warehouse'].includes(teamId)) {
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
        top: rect.bottom + 5,
        left: Math.max(10, rect.left - 120)
      };
      
      // Adjust if it would go off-screen
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
          variant="warehouse"
        />

        {/* Content */}
        <div className="p-6">
          {viewMode === 'weekly' ? (
            <>
              {isMobile ? (
                <MobileCalendarView events={combinedEvents} />
              ) : (
                <CustomCalendar
                  events={combinedEvents}
                  resources={resourcesWithWarehouse}
                  isLoading={isLoading || warehouseLoading}
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
                  allTeams={resourcesWithWarehouse}
                  variant="warehouse"
                />
              )}
            </>
          ) : viewMode === 'monthly' ? (
            <>
              <CustomCalendar
                events={combinedEvents}
                resources={resourcesWithWarehouse}
                isLoading={isLoading || warehouseLoading}
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
                allTeams={resourcesWithWarehouse}
                variant="warehouse"
              />
              {/* Week tabs for quick navigation within the month */}
              <WeekTabsNavigation
                currentMonth={monthlyDate}
                currentWeekStart={currentWeekStart}
                onWeekSelect={handleWeekSelect}
                variant="warehouse"
              />
            </>
          ) : (
            // List View
            <StaffBookingsList
              events={combinedEvents}
              resources={resourcesWithWarehouse}
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

export default WarehouseCalendarPage;
