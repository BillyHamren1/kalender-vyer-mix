import React, { useState, useEffect, useMemo } from 'react';
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
import WarehouseDayNavigationHeader from '@/components/Calendar/WarehouseDayNavigationHeader';
import WarehouseEventFilter, { WarehouseEventTypeFilter } from '@/components/Calendar/WarehouseEventFilter';
import BookingProductsDialog from '@/components/Calendar/BookingProductsDialog';
import { startOfWeek, startOfMonth, format, parseISO } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'day' | 'weekly' | 'monthly' | 'list'>('weekly');
  
  // Booking products dialog state
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  
  // Event type filter state - default all types visible
  const [eventTypeFilters, setEventTypeFilters] = useState<WarehouseEventTypeFilter[]>(() => {
    const stored = localStorage.getItem('warehouseEventTypeFilters');
    if (stored) {
      return JSON.parse(stored);
    }
    return ['rig', 'event', 'rigDown', 'packing', 'delivery', 'return', 'inventory', 'unpacking'];
  });

  // Save event type filters to localStorage
  useEffect(() => {
    localStorage.setItem('warehouseEventTypeFilters', JSON.stringify(eventTypeFilters));
  }, [eventTypeFilters]);
  
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
    view: viewMode === 'day' ? 'day' : viewMode === 'monthly' ? 'month' : 'week'
  });

  // Sync initial view/date from URL (?date=YYYY-MM-DD&view=day)
  useEffect(() => {
    const dateStr = searchParams.get('date');
    const viewParam = searchParams.get('view');

    if (!dateStr) return;
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) return;

    if (viewParam === 'day') {
      setViewMode('day');
      setCurrentWeekStart(parsed);
      setMonthlyDate(startOfMonth(parsed));
      return;
    }

    // For non-day deep links, keep behavior consistent with weekly grid
    setCurrentWeekStart(startOfWeek(parsed, { weekStartsOn: 1 }));
    setMonthlyDate(startOfMonth(parsed));
  }, [searchParams]);

  const setDayInUrl = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setSearchParams({ date: dateStr, view: 'day' });
  };

  const handleViewModeChange = (mode: 'day' | 'weekly' | 'monthly' | 'list') => {
    setViewMode(mode);

    // Only persist URL params for day deep links (used by dashboard calendar)
    if (mode === 'day') {
      setDayInUrl(currentWeekStart);
      return;
    }

    // Clear the explicit day param when leaving day view
    const dateStr = format(currentWeekStart, 'yyyy-MM-dd');
    setSearchParams({ date: dateStr });
  };

  const handleDayChange = (nextDate: Date) => {
    setCurrentWeekStart(nextDate);
    setMonthlyDate(startOfMonth(nextDate));
    setDayInUrl(nextDate);
  };
  
  // Combine standard calendar events with warehouse events and apply filters
  const mappedWarehouseEvents = mapWarehouseEventsToCalendarEvents(warehouseEvents);
  
  // Filter warehouse events based on selected event types
  const filteredWarehouseEvents = mappedWarehouseEvents.filter(event => {
    const eventType = event.eventType as WarehouseEventTypeFilter;
    return eventTypeFilters.includes(eventType);
  });
  
  // Filter calendar events (rig, event, rigdown) based on selected event types
  const filteredCalendarEvents = calendarEvents.filter(event => {
    const eventType = event.eventType as WarehouseEventTypeFilter;
    return eventTypeFilters.includes(eventType);
  });
  
  const combinedEvents: CalendarEvent[] = [...filteredCalendarEvents, ...filteredWarehouseEvents];

  const dayEvents = useMemo(() => {
    if (viewMode !== 'day') return combinedEvents;
    const dayKey = format(currentWeekStart, 'yyyy-MM-dd');
    return combinedEvents.filter((e) => {
      const start = new Date(e.start);
      return !isNaN(start.getTime()) && format(start, 'yyyy-MM-dd') === dayKey;
    });
  }, [combinedEvents, currentWeekStart, viewMode]);

  // Define which events are read-only in the warehouse calendar
  // Standard booking events (rig, event, rigDown) should NOT be editable from warehouse calendar
  const isEventReadOnly = (event: CalendarEvent): boolean => {
    const eventType = event.eventType;
    // Rig, Event, and RigDown events from the main calendar are read-only in warehouse view
    return eventType === 'rig' || eventType === 'event' || eventType === 'rigDown';
  };

  const { teamResources } = useTeamResources();
  
  // Map team resources to warehouse-specific names (Lager 1, Lager 2, etc.)
  const warehouseTeamResources = teamResources.map(team => {
    if (team.id === 'team-11') {
      return { ...team, title: 'Live' }; // Keep Live as-is
    }
    // Extract team number and rename to "Lager X"
    const match = team.id.match(/team-(\d+)/);
    if (match) {
      return { ...team, title: `Lager ${match[1]}` };
    }
    return team;
  });
  
  // Add warehouse resource to the resources list
  const warehouseResource = {
    id: 'warehouse',
    title: 'Packning',
    eventColor: '#E5E7EB'
  };
  const resourcesWithWarehouse = [...warehouseTeamResources, warehouseResource];

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

  // Handle event click to show booking products dialog
  const handleEventClick = (event: CalendarEvent) => {
    if (event.bookingId) {
      setSelectedBookingId(event.bookingId);
      setProductDialogOpen(true);
    }
  };

  // Handle create packing from dialog
  const handleCreatePacking = (bookingId: string, bookingClient: string) => {
    // Navigate to packing management with pre-filled data
    navigate(`/warehouse/packing?createFrom=${bookingId}`);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-muted/30">
        {/* Navigation with view toggle */}
        {viewMode === 'day' ? (
          <WarehouseDayNavigationHeader
            date={currentWeekStart}
            onDateChange={handleDayChange}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />
        ) : (
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            viewMode={viewMode as 'weekly' | 'monthly' | 'list'}
            onViewModeChange={handleViewModeChange}
            currentMonth={monthlyDate}
            onMonthChange={handleMonthChange}
            variant="warehouse"
          />
        )}

        {/* Filter bar */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-3">
          <WarehouseEventFilter
            activeFilters={eventTypeFilters}
            onFilterChange={setEventTypeFilters}
          />
          {eventTypeFilters.length < 8 && (
            <span className="text-sm text-muted-foreground">
              Visar {eventTypeFilters.length} av 8 händelsetyper
            </span>
          )}
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {viewMode === 'day' ? (
            <>
              {isMobile ? (
                <MobileCalendarView events={dayEvents} />
              ) : (
                <CustomCalendar
                  events={dayEvents}
                  resources={resourcesWithWarehouse}
                  isLoading={isLoading || warehouseLoading}
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
                  allTeams={resourcesWithWarehouse}
                  variant="warehouse"
                  isEventReadOnly={isEventReadOnly}
                  onEventClick={handleEventClick}
                />
              )}
            </>
          ) : viewMode === 'weekly' ? (
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
                  isEventReadOnly={isEventReadOnly}
                  onEventClick={handleEventClick}
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
                isEventReadOnly={isEventReadOnly}
                onEventClick={handleEventClick}
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

        {/* Booking Products Dialog */}
        <BookingProductsDialog
          open={productDialogOpen}
          onOpenChange={setProductDialogOpen}
          bookingId={selectedBookingId}
          onCreatePacking={handleCreatePacking}
        />
      </div>
    </TooltipProvider>
  );
};

export default WarehouseCalendarPage;
