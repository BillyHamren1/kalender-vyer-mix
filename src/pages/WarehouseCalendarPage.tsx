import React, { useState, useEffect, useMemo } from 'react';
import { usePlannerSync } from '@/stores/plannerStore';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useWarehouseCalendarEvents, WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import { useTransportCalendarEvents } from '@/hooks/useTransportCalendarEvents';
import { useWarehouseResources } from '@/hooks/useWarehouseResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useWarehouseStaffActivations } from '@/hooks/useWarehouseStaffActivations';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { distributeWarehouseEvents } from '@/utils/warehouseTeamAvailability';

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
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

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
    case 'internal_task':
      return 'internal_task';
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
    // Preserve explicit resource (e.g. internal_task) — others get redistributed.
    resourceId: we.resource_id && we.resource_id.startsWith('lager-')
      ? we.resource_id
      : 'lager-1',
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
  const { teamResources: warehouseTeamResources } = useWarehouseResources();

  // STORE SYNC: Bridge local state → central PlannerStore (legacy compatibility)
  const syncToStore = usePlannerSync();
  
  // Booking products dialog state
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  
  // Event type filter state - default all types visible
  const [eventTypeFilters, setEventTypeFilters] = useState<WarehouseEventTypeFilter[]>(() => {
    const stored = localStorage.getItem('warehouseEventTypeFilters');
    if (stored) {
      return JSON.parse(stored);
    }
    return ['rig', 'event', 'rigDown', 'packing', 'delivery', 'return', 'inventory', 'unpacking', 'internal_task'];
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
    setEvents,
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
  
  // STORE SYNC: Keep PlannerStore in sync with local state (legacy bridge)
  useEffect(() => {
    syncToStore({ selectedDate: currentWeekStart, viewMode });
  }, [currentWeekStart, viewMode, syncToStore]);

  // Warehouse-specific events
  const {
    events: warehouseEvents,
    loading: warehouseLoading,
    changedEventsCount
  } = useWarehouseCalendarEvents({ 
    currentDate: currentWeekStart,
    view: viewMode === 'day' ? 'day' : viewMode === 'monthly' ? 'month' : 'week'
  });

  // Transport events for the "Transporter" column
  const { transportEvents } = useTransportCalendarEvents(
    currentWeekStart,
    viewMode === 'day' ? 'day' : 'week'
  );

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
  
  // Distribute ALL events (calendar + warehouse) across lager resources using round-robin
  // Transport events are excluded from distribution — they already target resourceId 'transport'
  const allUnassigned = [...filteredCalendarEvents, ...filteredWarehouseEvents];
  const distributedEvents: CalendarEvent[] = distributeWarehouseEvents(allUnassigned, warehouseTeamResources);
  const combinedEvents: CalendarEvent[] = [...distributedEvents, ...transportEvents];

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

  
  // Resources list — warehouse resource no longer needed since events are distributed across lager columns
  const resourcesWithWarehouse = warehouseTeamResources;

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

  // Get visible teams for a specific day
  const getVisibleTeamsForDay = (date: Date): string[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const stored = visibleTeamsByDay[dateKey];
    const base = stored ?? ['lager-1', 'lager-2', 'lager-3', 'warehouse-event'];
    // Auto-include any lager column that has events on this day
    const extras = new Set<string>();
    for (const ev of combinedEvents) {
      const evDay = format(new Date(ev.start), 'yyyy-MM-dd');
      if (evDay !== dateKey) continue;
      if (ev.resourceId && ev.resourceId.startsWith('lager-') && !base.includes(ev.resourceId)) {
        extras.add(ev.resourceId);
      }
    }
    return [...base, ...Array.from(extras)];
  };

  // Toggle team visibility for a specific day
  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay(prev => {
      const currentVisible = prev[dateKey] || ['lager-1', 'lager-2', 'lager-3', 'warehouse-event'];
      
      if (currentVisible.includes(teamId)) {
        // Don't allow hiding Lager 1-3 or Transport column
        if (['lager-1', 'lager-2', 'lager-3', 'warehouse-event'].includes(teamId)) {
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

  // Only show activated warehouse staff in calendar
  const { activeStaffIds } = useWarehouseStaffActivations();

  // Use the unified staff operations hook — filtered by activated staff
  const staffOps = useUnifiedStaffOperations(currentWeekStart, 'weekly', 'Lager', activeStaffIds);

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

  // Single click disabled in warehouse calendar — use double-click / dedicated actions instead.
  const handleEventClick = (_event: CalendarEvent) => {};

  // Handle create packing from dialog
  const handleCreatePacking = (bookingId: string, bookingClient: string) => {
    // Navigate to packing management with pre-filled data
    navigate(`/warehouse/packing?createFrom=${bookingId}`);
  };

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--gradient-page)' }}>
        {/* Navigation with view toggle + filter */}
        <div className="flex items-center">
          <div className="flex-1">
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
          </div>
          <div className="pr-4 shrink-0">
            <WarehouseEventFilter
              activeFilters={eventTypeFilters}
              onFilterChange={setEventTypeFilters}
            />
          </div>
        </div>

        {/* Content - flex-1 to fill remaining space */}
        <div className="flex-1 min-h-0 flex flex-col p-4 bg-card rounded-2xl mx-2 mb-2 shadow-sm">
          {viewMode === 'day' ? (
            <>
              {isMobile ? (
                <MobileCalendarView events={dayEvents} />
              ) : (
                <CustomCalendar
                  events={dayEvents}
                  setEvents={setEvents}
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
                  activatedStaffIds={activeStaffIds}
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
                  setEvents={setEvents}
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
                  activatedStaffIds={activeStaffIds}
                />
              )}
            </>
          ) : viewMode === 'monthly' ? (
            <>
              <CustomCalendar
                events={combinedEvents}
                setEvents={setEvents}
                resources={resourcesWithWarehouse}
                isLoading={isLoading || warehouseLoading}
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
                allTeams={resourcesWithWarehouse}
                variant="warehouse"
                activatedStaffIds={activeStaffIds}
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
