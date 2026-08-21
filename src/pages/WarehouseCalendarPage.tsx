import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import WeekNavigation from '@/components/Calendar/WeekNavigation';
import WarehouseDayNavigationHeader from '@/components/Calendar/WarehouseDayNavigationHeader';
import WarehouseEventFilter, {
  WarehouseEventTypeFilter,
  WAREHOUSE_EVENT_TYPE_FILTERS,
} from '@/components/Calendar/WarehouseEventFilter';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';
import WarehouseGeneralCalendar from '@/components/warehouse/WarehouseGeneralCalendar';
import WarehousePersonnelCalendar from '@/components/warehouse/WarehousePersonnelCalendar';

import { useWarehouseCalendarEvents, type WarehouseEvent } from '@/hooks/useWarehouseCalendarEvents';
import { useTransportCalendarEvents } from '@/hooks/useTransportCalendarEvents';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useWarehousePersonnelCalendar } from '@/hooks/useWarehousePersonnelCalendar';
import {
  useWarehousePackingStats,
  useWarehouseBookingTitles,
} from '@/hooks/useWarehouseCardMeta';
import { assignStaffToWarehouseEvent } from '@/services/warehouseAssignmentsSync';

const WAREHOUSE_ACTIVITY_LABELS: Record<string, string> = {
  packing: 'Packning',
  return: 'Retur',
  delivery: 'Utleverans',
  unpacking: 'Uppackning',
  inventory: 'Inventering',
  internal_task: 'Lageruppgift',
};

const mapWarehouseEventType = (warehouseType: string): CalendarEvent['eventType'] => {
  switch (warehouseType) {
    case 'packing': return 'packing';
    case 'delivery': return 'delivery';
    case 'return': return 'return';
    case 'inventory': return 'inventory';
    case 'unpacking': return 'unpacking';
    case 'internal_task': return 'internal_task';
    default: return 'internal_task';
  }
};

const formatPhaseDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = parseISO(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'd MMM');
};

const buildPhaseContext = (event: WarehouseEvent): string | undefined => {
  const parts = [
    ['Rigg', formatPhaseDate(event.source_rig_date)],
    ['Event', formatPhaseDate(event.source_event_date)],
    ['Riv', formatPhaseDate(event.source_rigdown_date)],
  ]
    .filter(([, value]) => !!value)
    .map(([label, value]) => `${label}: ${value}`);
  return parts.length ? parts.join(' · ') : undefined;
};

const mapWarehouseEvents = (events: WarehouseEvent[]): CalendarEvent[] =>
  events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    // Behåll resource-id som compatibility-data. Den används inte längre för
    // presentationen, men äldre writes/sync kan fortfarande förlita sig på den.
    resourceId: event.resource_id || 'warehouse',
    bookingId: event.booking_id,
    bookingNumber: event.booking_number || undefined,
    eventType: mapWarehouseEventType(event.event_type),
    deliveryAddress: event.delivery_address || undefined,
    viewed: event.viewed,
    extendedProps: {
      bookingNumber: event.booking_number || undefined,
      booking_id: event.booking_id,
      deliveryCity: event.delivery_address?.split(',')[0] || undefined,
      has_source_changes: event.has_source_changes,
      manually_adjusted: event.manually_adjusted,
      change_details: event.change_details || undefined,
      phaseContext: buildPhaseContext(event),
      sourceRigDate: event.source_rig_date || undefined,
      sourceEventDate: event.source_event_date || undefined,
      sourceRigDownDate: event.source_rigdown_date || undefined,
      legacyWarehouseResourceId: event.resource_id || undefined,
    },
  }));

type CalendarSurface = 'calendar' | 'personnel';
type ViewMode = 'day' | 'weekly' | 'monthly' | 'list';

const WarehouseCalendarPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDate = useMemo(() => {
    const value = searchParams.get('date');
    if (!value) return new Date();
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, []);

  const [currentDate, setCurrentDate] = useState(() => startOfWeek(initialDate, { weekStartsOn: 1 }));
  const [monthlyDate, setMonthlyDate] = useState(() => startOfMonth(initialDate));
  const [viewMode, setViewMode] = useState<ViewMode>(() => searchParams.get('view') === 'day' ? 'day' : 'weekly');
  const [surface, setSurface] = useState<CalendarSurface>('calendar');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [assigningStaffId, setAssigningStaffId] = useState<string | null>(null);
  const [eventTypeFilters, setEventTypeFilters] = useState<WarehouseEventTypeFilter[]>(() => {
    try {
      const raw = localStorage.getItem('warehouseEventTypeFilters');
      if (!raw) return [...WAREHOUSE_EVENT_TYPE_FILTERS];
      const parsed = JSON.parse(raw) as string[];
      const valid = parsed.filter((value) => (WAREHOUSE_EVENT_TYPE_FILTERS as string[]).includes(value)) as WarehouseEventTypeFilter[];
      return valid.length ? valid : [...WAREHOUSE_EVENT_TYPE_FILTERS];
    } catch {
      return [...WAREHOUSE_EVENT_TYPE_FILTERS];
    }
  });

  const warehouseView = viewMode === 'day' ? 'day' : viewMode === 'monthly' ? 'month' : 'week';
  const { events: warehouseEvents, loading: warehouseLoading } = useWarehouseCalendarEvents({
    currentDate,
    view: warehouseView,
  });
  const { transportEvents } = useTransportCalendarEvents(currentDate, warehouseView);

  const filteredWarehouseEvents = useMemo(() => {
    return mapWarehouseEvents(warehouseEvents).filter((event) =>
      eventTypeFilters.includes(event.eventType as WarehouseEventTypeFilter),
    );
  }, [warehouseEvents, eventTypeFilters]);

  const bookingIds = useMemo(
    () => filteredWarehouseEvents.map((event) => event.bookingId).filter(Boolean) as string[],
    [filteredWarehouseEvents],
  );
  const { data: packingStats } = useWarehousePackingStats(bookingIds);
  const { data: bookingTitles } = useWarehouseBookingTitles(bookingIds);

  const enrichedEvents = useMemo<CalendarEvent[]>(() => {
    const warehouse = filteredWarehouseEvents.map((event) => {
      const stat = event.bookingId ? packingStats?.get(event.bookingId) : undefined;
      const bookingTitle = event.bookingId ? bookingTitles?.get(event.bookingId) : undefined;
      return {
        ...event,
        extendedProps: {
          ...event.extendedProps,
          warehouseActivityLabel: WAREHOUSE_ACTIVITY_LABELS[event.eventType as string],
          bookingTitle: bookingTitle ?? event.extendedProps?.bookingTitle,
          timeLabel: `${format(new Date(event.start), 'HH:mm')}–${format(new Date(event.end), 'HH:mm')}`,
          packedLabel: stat && stat.total > 0 ? `${stat.packed} / ${stat.total} klara` : undefined,
        },
      };
    });
    return [...warehouse, ...transportEvents];
  }, [filteredWarehouseEvents, packingStats, bookingTitles, transportEvents]);

  const range = useMemo(() => {
    if (viewMode === 'day') {
      const day = format(currentDate, 'yyyy-MM-dd');
      return { from: day, to: day };
    }
    if (viewMode === 'monthly') {
      return {
        from: format(startOfMonth(monthlyDate), 'yyyy-MM-dd'),
        to: format(endOfMonth(monthlyDate), 'yyyy-MM-dd'),
      };
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
  }, [currentDate, monthlyDate, viewMode]);

  const personnel = useWarehousePersonnelCalendar(range);
  const staffOps = useUnifiedStaffOperations(currentDate, 'weekly', 'Lager');

  const setDateInUrl = (date: Date, mode: ViewMode) => {
    setSearchParams({ date: format(date, 'yyyy-MM-dd'), ...(mode === 'day' ? { view: 'day' } : {}) });
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setDateInUrl(currentDate, mode);
  };

  const handleDayChange = (date: Date) => {
    setCurrentDate(date);
    setMonthlyDate(startOfMonth(date));
    setDateInUrl(date, 'day');
  };

  const handleMonthChange = (date: Date) => {
    setMonthlyDate(startOfMonth(date));
    setCurrentDate(startOfWeek(startOfMonth(date), { weekStartsOn: 1 }));
  };

  const handleOpenEvent = (event: CalendarEvent) => {
    if (event.bookingId) {
      navigate(`/warehouse/bookings/${event.bookingId}`);
      return;
    }
    if (event.extendedProps?.packingId) {
      navigate(`/warehouse/packing/${event.extendedProps.packingId}`);
    }
  };

  const handleOpenAssignment = (assignment: (typeof personnel.assignments)[number]) => {
    if (assignment.packingId) {
      navigate(`/warehouse/packing/${assignment.packingId}`);
      return;
    }
    if (assignment.bookingId) navigate(`/warehouse/bookings/${assignment.bookingId}`);
  };

  const handleAssignStaff = async (staffId: string) => {
    if (!selectedEvent || selectedEvent.eventType === 'transport') return;
    setAssigningStaffId(staffId);
    try {
      await assignStaffToWarehouseEvent({ staffId, warehouseEventId: selectedEvent.id });
      toast.success('Personal tilldelad');
      await personnel.refetch();
      staffOps.forceRefresh();
      setSelectedEvent(null);
    } catch (error) {
      console.error(error);
      toast.error('Kunde inte tilldela personal');
    } finally {
      setAssigningStaffId(null);
    }
  };

  const persistFilters = (filters: WarehouseEventTypeFilter[]) => {
    setEventTypeFilters(filters);
    localStorage.setItem('warehouseEventTypeFilters', JSON.stringify(filters));
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden" style={{ background: 'var(--gradient-page)' }}>
        <div className="shrink-0 border-b border-border/50 bg-background/90">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={surface === 'calendar' ? 'secondary' : 'ghost'}
                className="h-8 gap-1.5 rounded-md px-3"
                onClick={() => setSurface('calendar')}
              >
                <CalendarDays className="h-4 w-4" />
                Kalender
              </Button>
              <Button
                type="button"
                size="sm"
                variant={surface === 'personnel' ? 'secondary' : 'ghost'}
                className="h-8 gap-1.5 rounded-md px-3"
                onClick={() => setSurface('personnel')}
              >
                <Users className="h-4 w-4" />
                Personal
              </Button>
            </div>

            <div className="min-w-0 flex-1">
              {viewMode === 'day' ? (
                <WarehouseDayNavigationHeader
                  date={currentDate}
                  onDateChange={handleDayChange}
                  viewMode={viewMode}
                  onViewModeChange={handleViewModeChange}
                />
              ) : (
                <WeekNavigation
                  currentWeekStart={currentDate}
                  setCurrentWeekStart={setCurrentDate}
                  viewMode={viewMode as 'weekly' | 'monthly' | 'list'}
                  onViewModeChange={handleViewModeChange}
                  currentMonth={monthlyDate}
                  onMonthChange={handleMonthChange}
                  variant="warehouse"
                />
              )}
            </div>

            {surface === 'calendar' && (
              <WarehouseEventFilter activeFilters={eventTypeFilters} onFilterChange={persistFilters} />
            )}
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          <div className="mx-auto max-w-[1700px]">
            {surface === 'calendar' ? (
              warehouseLoading ? (
                <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laddar lagerkalender…
                </div>
              ) : (
                <WarehouseGeneralCalendar
                  events={enrichedEvents}
                  currentDate={viewMode === 'monthly' ? monthlyDate : currentDate}
                  viewMode={viewMode}
                  onOpenEvent={handleOpenEvent}
                  onAssignStaff={setSelectedEvent}
                />
              )
            ) : (
              personnel.isLoading ? (
                <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laddar personalvy…
                </div>
              ) : (
                <WarehousePersonnelCalendar
                  assignments={personnel.assignments}
                  productivity={personnel.productivity}
                  currentDate={viewMode === 'monthly' ? monthlyDate : currentDate}
                  viewMode={viewMode}
                  onOpenAssignment={handleOpenAssignment}
                />
              )
            )}
          </div>
        </main>

        <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tilldela personal</DialogTitle>
              <DialogDescription>
                {selectedEvent ? `${selectedEvent.title} · ${format(new Date(selectedEvent.start), 'd MMM HH:mm')}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[420px] divide-y divide-border/50 overflow-auto rounded-lg border border-border/60">
              {staffOps.availableStaff.map((staff) => (
                <div key={staff.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm font-medium text-foreground">{staff.name}</span>
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={assigningStaffId === staff.id}
                    onClick={() => handleAssignStaff(staff.id)}
                  >
                    {assigningStaffId === staff.id ? 'Tilldelar…' : 'Tilldela'}
                  </Button>
                </div>
              ))}
              {staffOps.availableStaff.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">Ingen Lager-taggad personal hittades.</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default WarehouseCalendarPage;
